/* Shared helpers for the CJ's ad scenes. Every value is a pure function of timeline time, so any frame
   renders the same on its own. Custom eases are used as "tracks": a tween from 0 to 1 whose ease returns
   the property's value in px (or opacity) for that moment. */
window.FX = (() => {
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Split an element's text into words. mask: each word sits in an overflow-hidden box so it can rise into view. */
  function words(el, mask) {
    const list = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    const out = [];
    list.forEach((w, i) => {
      const box = document.createElement("span");
      box.className = mask ? "mk" : "wb";
      const s = document.createElement("span");
      s.className = "w";
      s.textContent = w;
      box.appendChild(s);
      el.appendChild(box);
      if (i < list.length - 1) el.appendChild(document.createTextNode(" "));
      out.push(s);
    });
    return out;
  }

  /* Split into characters, each in a box (a mask box unless mask is false). Spaces stay as plain spaces. */
  function chars(el, mask = true) {
    const text = el.textContent.trim();
    el.textContent = "";
    const out = [];
    for (const ch of text) {
      if (ch === " ") {
        el.appendChild(document.createTextNode(" "));
        continue;
      }
      const box = document.createElement("span");
      box.className = mask ? "mk" : "wb";
      const s = document.createElement("span");
      s.className = "w";
      s.textContent = ch;
      box.appendChild(s);
      el.appendChild(box);
      out.push(s);
    }
    return out;
  }

  /* Odometer: each digit becomes a strip 0-9,0-9 that rolls up and stops on the digit. */
  function odometer(el) {
    const text = el.textContent;
    el.textContent = "";
    const strips = [];
    for (const ch of text) {
      if (/[0-9]/.test(ch)) {
        const win = document.createElement("span");
        win.className = "odw";
        win.setAttribute("data-layout-allow-overflow", "");
        const sizer = document.createElement("span");
        sizer.className = "odz";
        sizer.textContent = ch;
        const strip = document.createElement("span");
        strip.className = "ods";
        strip.setAttribute("data-layout-ignore", "");
        for (let k = 0; k < 20; k++) {
          const d = document.createElement("span");
          d.textContent = String(k % 10);
          strip.appendChild(d);
        }
        win.appendChild(sizer);
        win.appendChild(strip);
        el.appendChild(win);
        strips.push({ strip, k: 10 + Number(ch) });
      } else {
        const s = document.createElement("span");
        s.className = "odc";
        s.textContent = ch;
        el.appendChild(s);
      }
    }
    return strips;
  }

  function roll(tl, strips, t, dur, stagger) {
    strips.forEach((s, i) => {
      tl.fromTo(s.strip, { yPercent: 0 }, { yPercent: -5 * s.k, duration: dur, ease: "power3.out" }, t + i * stagger);
    });
  }

  /* A track: prop follows fn(local seconds) over [t, t + dur]. fn(0) must be the resting value before it starts. */
  function track(tl, el, prop, t, dur, fn) {
    tl.fromTo(el, { [prop]: 0 }, { [prop]: 1, duration: dur, ease: (p) => fn(p * dur) }, t);
  }

  /* A block falling from `dist` px above its place: gravity fall, contact at t + fall, then a small settle. */
  function drop(tl, el, t, fall, dist) {
    const settle = 0.16;
    const fn = (tt) => {
      if (tt < fall) return -dist * (1 - (tt / fall) ** 2);
      const u = Math.min(1, (tt - fall) / settle);
      return 7 * Math.sin(Math.PI * u) * (1 - u);
    };
    const T = fall + settle;
    tl.fromTo(el, { y: -dist }, { y: 0, duration: T, ease: (p) => (fn(p * T) + dist) / dist }, t);
  }

  /* Dust where a block lands: soft puffs that roll out sideways and small chips thrown up under gravity. */
  function dust(tl, layer, t, x1, x2, yb, seed) {
    const r = rng(seed);
    for (const side of [-1, 1]) {
      const ox = side < 0 ? x1 : x2;
      for (let k = 0; k < 8; k++) {
        const puff = k < 3;
        const el = document.createElement("i");
        el.className = puff ? "puff" : "chip";
        const size = puff ? 34 + r() * 30 : 4 + r() * 6;
        el.style.width = el.style.height = size.toFixed(1) + "px";
        el.style.left = (ox - size / 2 + side * r() * 10).toFixed(1) + "px";
        el.style.top = (yb - size / 2 - (puff ? 6 : 2)).toFixed(1) + "px";
        layer.appendChild(el);
        const T = puff ? 0.8 + r() * 0.35 : 0.45 + r() * 0.3;
        const vx = side * (puff ? 140 + r() * 170 : 120 + r() * 300);
        const vy = puff ? -(30 + r() * 60) : -(180 + r() * 300);
        const drag = puff ? 2.2 : 0.6;
        const g = puff ? 40 : 1700;
        track(tl, el, "x", t, T, (tt) => (vx * (1 - Math.exp(-drag * tt))) / drag);
        track(tl, el, "y", t, T, (tt) => Math.min(4, vy * tt + 0.5 * g * tt * tt));
        const peak = puff ? 0.5 : 0.95;
        track(tl, el, "opacity", t, T, (tt) => peak * Math.min(1, tt / 0.035) * Math.pow(Math.max(0, 1 - tt / T), puff ? 1.4 : 1));
        if (puff) track(tl, el, "scale", t, T, (tt) => 0.35 + 1.5 * (1 - Math.exp(-tt / 0.22)));
        tl.set(el, { opacity: 0 }, t + T + 0.001);
      }
    }
  }

  /* Camera shake: a decaying jolt at each landing time, as one x track and one y track over the scene. */
  function shake(tl, cam, dur, lands, amp) {
    const f = (tt, fq, ph, k) => {
      let s = 0;
      for (const t0 of lands) {
        const d = tt - t0;
        if (d >= 0 && d < 0.35) s += k * amp * Math.exp(-d / 0.06) * Math.sin(2 * Math.PI * fq * d + ph);
      }
      return s;
    };
    track(tl, cam, "y", 0, dur, (tt) => f(tt, 26, 0, 1));
    track(tl, cam, "x", 0, dur, (tt) => f(tt, 21, 1.3, 0.4));
  }

  return { rng, words, chars, odometer, roll, track, drop, dust, shake };
})();
