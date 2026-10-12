// lookaround.js
// ---------------
// The look-around portrait: a grid of photos of you looking in different
// directions. The page works out where the pointer is, then blends the four
// photos around that spot so the head turns smoothly, however few photos
// there are. Words floating around the portrait react to the pointer too.
//
// The same code also powers the preview on the photo-shoot helper page
// (/look-shoot/), which is why it is exposed as window.LookAround.mount().
//
// Nothing here needs a library. The photos are drawn onto a <canvas>.
//
// Adding ?debug=1 to the page address shows which photos are in use;
// ?flipx=1 / ?flipy=1 mirror the direction if your photos turned out reversed.
// ?mode=nearest shows the single closest photo with a quick fade, instead of
// blending four (best with a dense grid of photos).

(function () {
  "use strict";

  // -- Settings you might want to tweak ------------------------------------
  const REACH = 0.85;       // 1 = pointer must reach the window edge for the full turn; lower = turns fully sooner
  const HEAD_EASE = 5;      // how quickly the head follows (higher = snappier, lower = lazier)
  const WORD_EASE = 12;     // how quickly words react to the pointer
  const IDLE_MS = 2500;     // with no pointer around for this long, the head wanders by itself
  const FOCUS_Y = 0.4;      // which part of the photo stays visible when it has to be cropped to fit (0 = top, 1 = bottom)
  const MODE = "blend";     // "blend" mixes the four nearest photos by position; "nearest" shows the single closest photo and quickly fades when it changes (try it with ?mode=nearest). Nearest looks best with a dense grid.
  const FADE_MS = 110;      // nearest mode: how long the fade between two photos lasts
  const SMOOTH_BLEND = true; // blend mode: ease the mix so each photo is "clean" for longer (less ghosting)
  const WORD_RADIUS = 0.28; // how close the pointer must get to wake a word (share of the window's shorter side)

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smoothstep = (t) => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };

  function mount(stage, options) {
    const canvas = stage.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const cols = options.cols;
    const rows = options.rows;
    const params = new URLSearchParams(location.search);
    const flipX = params.get("flipx") === "1";
    const flipY = params.get("flipy") === "1";
    const mode = params.get("mode") || MODE;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // -- Loading the photos -------------------------------------------------
    const loaded = new Map(); // "col,row" -> image
    const key = (c, r) => c + "," + r;
    let aspect = 0;           // width / height of the photos
    let dirty = true;         // true when the canvas needs redrawing

    // Load the centre first, then outwards, so the page is usable at once.
    const centre = { c: (cols - 1) / 2, r: (rows - 1) / 2 };
    const queue = options.frames.slice().sort((a, b) =>
      Math.hypot(a.c - centre.c, a.r - centre.r) - Math.hypot(b.c - centre.c, b.r - centre.r));

    queue.forEach((frame) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        loaded.set(key(frame.c, frame.r), img);
        if (!aspect) aspect = img.naturalWidth / img.naturalHeight;
        dirty = true;
      };
      img.src = frame.src;
    });

    // The photo for a grid spot, or the nearest one that has loaded.
    function frameFor(c, r) {
      const exact = loaded.get(key(c, r));
      if (exact) return exact;
      let best = null;
      let bestDistance = Infinity;
      loaded.forEach((img, k) => {
        const [cc, rr] = k.split(",").map(Number);
        const d = Math.hypot(cc - c, rr - r);
        if (d < bestDistance) { bestDistance = d; best = img; }
      });
      return best;
    }

    // -- Canvas size ----------------------------------------------------------
    let W = 1, H = 1; // stage size in CSS pixels

    function resize() {
      const nav = document.querySelector(".site-nav");
      if (nav && stage.classList.contains("look") && !stage.closest(".shoot")) {
        stage.style.setProperty("--nav-height", nav.offsetHeight + "px");
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = stage.clientWidth || 1;
      H = stage.clientHeight || 1;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      layoutWords();
      dirty = true;
    }

    // -- Floating words ---------------------------------------------------------
    const words = Array.from(stage.querySelectorAll("[data-word]")).map((el, i) => ({
      el,
      manualX: isFinite(parseFloat(el.dataset.x)) ? parseFloat(el.dataset.x) : null,
      manualY: isFinite(parseFloat(el.dataset.y)) ? parseFloat(el.dataset.y) : null,
      depth: 0.5 + ((i * 37) % 10) / 10, // 0.5 - 1.4: how much it drifts with the pointer
      phase: i * 1.7,                    // so words don't all bob in step
      cx: 0, cy: 0,                      // centre in stage pixels
      glow: 0,                           // 0 = asleep, 1 = fully woken (smoothed)
    }));

    function layoutWords() {
      // Words without a set position are spread around an ellipse so they
      // frame the portrait instead of covering the face.
      const auto = words.filter((w) => w.manualX === null || w.manualY === null);
      auto.forEach((w, k) => {
        const angle = -Math.PI / 2 + (k / auto.length) * Math.PI * 2 + 0.35;
        const jitterX = (((k * 7919) % 13) / 13 - 0.5) * 6;
        const jitterY = (((k * 104729) % 11) / 11 - 0.5) * 8;
        w.autoX = 50 + Math.cos(angle) * 40 + jitterX;
        w.autoY = 50 + Math.sin(angle) * 38 + jitterY;
      });
      // Work in pixels from here: start every word at its spot, then nudge
      // the automatically placed ones apart so no two overlap and none sits
      // on the face. Words with a position set in /admin never move.
      const PAD = 10;
      words.forEach((w) => {
        const fixed = w.manualX !== null && w.manualY !== null;
        w.fixed = fixed;
        w.hw = w.el.offsetWidth / 2;
        w.hh = w.el.offsetHeight / 2;
        w.cx = ((fixed ? w.manualX : w.autoX) / 100) * W;
        w.cy = ((fixed ? w.manualY : w.autoY) / 100) * H;
      });
      const keepInside = (w) => {
        w.cx = clamp(w.cx, w.hw + PAD, W - w.hw - PAD);
        w.cy = clamp(w.cy, w.hh + PAD, H - w.hh - PAD);
      };
      for (let pass = 0; pass < 60; pass++) {
        let moved = false;
        for (let i = 0; i < words.length; i++) {
          for (let j = i + 1; j < words.length; j++) {
            const a = words[i], b = words[j];
            const dx = b.cx - a.cx, dy = b.cy - a.cy;
            const ox = a.hw + b.hw + PAD - Math.abs(dx);
            const oy = a.hh + b.hh + PAD - Math.abs(dy);
            if (ox <= 0 || oy <= 0) continue;
            // Push apart along the direction that needs the smaller move.
            const share = a.fixed || b.fixed ? 1 : 0.5;
            if (ox < oy) {
              const dir = dx === 0 ? 1 : Math.sign(dx);
              if (!a.fixed) a.cx -= dir * ox * share;
              if (!b.fixed) b.cx += dir * ox * share;
            } else {
              const dir = dy === 0 ? 1 : Math.sign(dy);
              if (!a.fixed) a.cy -= dir * oy * share;
              if (!b.fixed) b.cy += dir * oy * share;
            }
            moved = true;
          }
        }
        // Keep the middle of the stage (the face) clear. A word on the face
        // moves out whichever way is shortest and still fits on screen.
        const faceW = Math.max(W * 0.13, Math.min(W * 0.3, H * 0.22));
        const faceH = H * 0.32;
        words.forEach((w) => {
          if (w.fixed) return;
          const dx = w.cx - W / 2, dy = w.cy - H / 2;
          if (Math.abs(dx) >= faceW + w.hw || Math.abs(dy) >= faceH + w.hh) return;
          const options = [
            [W / 2 + faceW + w.hw, w.cy], [W / 2 - faceW - w.hw, w.cy],
            [w.cx, H / 2 - faceH - w.hh], [w.cx, H / 2 + faceH + w.hh],
          ];
          const fits = (o) => o[0] - w.hw >= PAD && o[0] + w.hw <= W - PAD && o[1] - w.hh >= PAD && o[1] + w.hh <= H - PAD;
          const dist = (o) => Math.hypot(o[0] - w.cx, o[1] - w.cy);
          const usable = options.filter(fits);
          const pick = (usable.length ? usable : options).sort((p, q) => dist(p) - dist(q))[0];
          w.cx = pick[0];
          w.cy = pick[1];
          moved = true;
        });
        words.forEach((w) => { if (!w.fixed) keepInside(w); });
        if (!moved) break;
      }
      words.forEach((w) => {
        w.el.style.left = ((w.cx / W) * 100).toFixed(2) + "%";
        w.el.style.top = ((w.cy / H) * 100).toFixed(2) + "%";
      });
    }

    // -- Pointer ----------------------------------------------------------------
    const pointer = { x: 0, y: 0, inside: false, lastInput: -Infinity };

    function onPointer(event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.lastInput = performance.now();
      pointer.inside = event.pointerType === "mouse" ? true : event.type !== "pointerup";
    }
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") { pointer.inside = false; pointer.lastInput = performance.now(); } }, { passive: true });
    window.addEventListener("pointercancel", () => { pointer.inside = false; pointer.lastInput = performance.now(); }, { passive: true });
    document.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget) { pointer.inside = false; pointer.lastInput = performance.now(); }
    });

    // -- Drawing ----------------------------------------------------------------
    const state = { u: 0.5, v: 0.5, wx: 0, wy: 0 }; // eased look position (0-1) and eased pointer (px)
    let drawnU = -1, drawnV = -1;

    function drawCover(img) {
      const cw = canvas.width, ch = canvas.height;
      const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) * FOCUS_Y, dw, dh);
    }

    function draw() {
      const gx = state.u * (cols - 1);
      const gy = state.v * (rows - 1);
      const c0 = Math.floor(gx), r0 = Math.floor(gy);
      const c1 = Math.min(cols - 1, c0 + 1), r1 = Math.min(rows - 1, r0 + 1);
      let fx = gx - c0, fy = gy - r0;
      if (SMOOTH_BLEND) { fx = smoothstep(fx); fy = smoothstep(fy); }

      // A weighted average of the four photos around the look position:
      // each is painted over the last with just enough opacity that the
      // end result is exactly the weighted mix.
      const parts = [
        [c0, r0, (1 - fx) * (1 - fy)],
        [c1, r0, fx * (1 - fy)],
        [c0, r1, (1 - fx) * fy],
        [c1, r1, fx * fy],
      ];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let total = 0;
      for (const [c, r, weight] of parts) {
        if (weight < 0.002) continue;
        const img = frameFor(c, r);
        if (!img) continue;
        total += weight;
        ctx.globalAlpha = weight / total;
        drawCover(img);
      }
      ctx.globalAlpha = 1;
      drawnU = state.u; drawnV = state.v;
      dirty = false;
    }

    // Nearest mode: show the closest photo only. When the closest photo
    // changes, fade to the new one over a very short time, so a ghost is only
    // on screen for a moment instead of whenever the head is between photos.
    let node = null;        // grid spot currently chosen
    let shownImg = null;    // photo fully visible
    let incomingImg = null; // photo fading in
    let fadeStart = 0;

    function drawNearest(now) {
      const gx = state.u * (cols - 1);
      const gy = state.v * (rows - 1);
      // Hysteresis: only move to a new spot once clearly past the halfway
      // line, so the picture doesn't flicker when the pointer rests between two.
      if (!node || Math.abs(gx - node.c) > 0.62 || Math.abs(gy - node.r) > 0.62 || dirty) {
        const c = clamp(Math.round(gx), 0, cols - 1);
        const r = clamp(Math.round(gy), 0, rows - 1);
        const img = frameFor(c, r);
        node = { c, r };
        if (img && img !== (incomingImg || shownImg)) {
          if (!shownImg) {
            shownImg = img;
          } else {
            if (incomingImg) shownImg = incomingImg; // a fade was running: take it as done
            incomingImg = img;
            fadeStart = now;
          }
        }
      }
      if (!shownImg) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawCover(shownImg);
      if (incomingImg) {
        const a = smoothstep((now - fadeStart) / FADE_MS);
        ctx.globalAlpha = a;
        drawCover(incomingImg);
        ctx.globalAlpha = 1;
        if (a >= 1) { shownImg = incomingImg; incomingImg = null; }
      }
      dirty = false;
    }

    // -- Debug read-out -----------------------------------------------------------
    let debugEl = null;
    if (params.get("debug") === "1") {
      debugEl = document.createElement("div");
      debugEl.className = "look__debug";
      stage.appendChild(debugEl);
    }

    // -- Main loop ------------------------------------------------------------------
    let visible = true;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(stage);
    }

    let last = performance.now();
    function tick(now) {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;

      const rect = stage.getBoundingClientRect();

      // Where should the head look? At the pointer, or wandering if there is none.
      let targetU = 0.5, targetV = 0.5, pointerX = W / 2, pointerY = H / 2;
      const wandering = !pointer.inside && now - pointer.lastInput > IDLE_MS;
      if (reduceMotion) {
        // Still portrait; words stay readable and don't move.
      } else if (wandering) {
        const t = now / 1000;
        targetU = 0.5 + 0.32 * Math.sin(t * 0.5);
        targetV = 0.5 + 0.2 * Math.sin(t * 0.37 + 1.3);
        pointerX = (0.5 + (targetU - 0.5) * REACH) * W;
        pointerY = (0.5 + (targetV - 0.5) * REACH) * H;
      } else {
        const nx = (pointer.x - rect.left) / rect.width;
        const ny = (pointer.y - rect.top) / rect.height;
        targetU = clamp(0.5 + (nx - 0.5) / REACH, 0, 1);
        targetV = clamp(0.5 + (ny - 0.5) / REACH, 0, 1);
        pointerX = pointer.x - rect.left;
        pointerY = pointer.y - rect.top;
      }
      if (flipX) targetU = 1 - targetU;
      if (flipY) targetV = 1 - targetV;

      // Ease toward the target so the head chases the pointer instead of snapping.
      const k = 1 - Math.exp(-HEAD_EASE * dt);
      state.u += (targetU - state.u) * k;
      state.v += (targetV - state.v) * k;
      const kw = 1 - Math.exp(-WORD_EASE * dt);
      state.wx += (pointerX - state.wx) * kw;
      state.wy += (pointerY - state.wy) * kw;

      if (mode === "nearest") {
        if (loaded.size && (dirty || incomingImg || Math.abs(state.u - drawnU) > 0.0002 || Math.abs(state.v - drawnV) > 0.0002)) {
          drawNearest(now);
          drawnU = state.u; drawnV = state.v;
        }
      } else if (dirty || Math.abs(state.u - drawnU) > 0.0002 || Math.abs(state.v - drawnV) > 0.0002) {
        if (loaded.size) draw();
      }

      // Words: wake up, grow, sharpen and lean toward the pointer when it is near.
      const radius = Math.max(140, Math.min(W, H) * WORD_RADIUS);
      for (const w of words) {
        if (reduceMotion) {
          w.el.style.opacity = "0.75";
          continue;
        }
        const dx = state.wx - w.cx, dy = state.wy - w.cy;
        const near = smoothstep(1 - Math.hypot(dx, dy) / radius);
        w.glow += (near - w.glow) * kw;
        const drift = Math.sin(now / 1000 * 0.6 + w.phase) * 5;
        const parX = (0.5 - state.wx / W) * w.depth * 36;
        const parY = (0.5 - state.wy / H) * w.depth * 24;
        const tx = parX + dx * 0.1 * w.glow;
        const ty = parY + drift + dy * 0.1 * w.glow;
        // Grow when woken, but never wider than the stage itself.
        const maxScale = Math.min(1.85, (W - 20) / (w.hw * 2));
        const scale = 1 + Math.max(0, maxScale - 1) * w.glow;
        w.el.style.transform = "translate(-50%, -50%) translate3d(" + tx.toFixed(1) + "px," + ty.toFixed(1) + "px,0) scale(" + scale.toFixed(3) + ")";
        w.el.style.opacity = (0.22 + 0.78 * w.glow).toFixed(3);
        w.el.style.filter = "blur(" + ((1 - w.glow) * 2).toFixed(2) + "px)";
      }

      if (debugEl) {
        debugEl.textContent =
          "photos " + loaded.size + "/" + options.frames.length +
          "  look " + (state.u * (cols - 1)).toFixed(2) + ", " + (state.v * (rows - 1)).toFixed(2) +
          "  mode " + mode + (wandering ? "  (wandering)" : "");
      }
    }

    new ResizeObserver(resize).observe(stage);
    window.addEventListener("resize", resize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutWords);
    resize();
    requestAnimationFrame(tick);
  }

  window.LookAround = { mount };

  // The About page itself: find the stage and start it.
  document.addEventListener("DOMContentLoaded", () => {
    const stage = document.querySelector("[data-look-stage]:not([data-manual])");
    if (!stage) return;
    const frames = Array.from(stage.querySelectorAll("[data-frame]")).map((el) => ({
      c: Number(el.dataset.c),
      r: Number(el.dataset.r),
      src: el.dataset.src,
    }));
    mount(stage, { cols: Number(stage.dataset.cols), rows: Number(stage.dataset.rows), frames });
  });
})();
