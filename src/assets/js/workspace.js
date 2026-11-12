// workspace.js
// Draws the right one of the 60 pictures for where the mouse is, so the room
// seems to turn as you move the mouse left and right. (Plain canvas; no
// library is needed for this.)
//
//   SMOOTHING   how quickly the view follows the mouse (0.03 = slow and
//               floaty, 0.2 = snappy)
//   EDGE        how much of the window's left and right edges count as "all
//               the way left" / "all the way right" (0.08 = 8%)
//   DRIFT       while nobody has moved the mouse yet (or touched the screen),
//               the view drifts slowly left and right by itself
//   ZOOM        how much the picture is enlarged, to leave room above and below
//               that is only shown when the mouse goes up or down (0.1 = 10%;
//               0 = no up and down movement at all)
//   SETTLE      how long the mouse must be still, in milliseconds, before the
//               view settles onto one single picture (so there is never a
//               see-through mix of two)
(function () {
  var SMOOTHING = 0.07;
  var EDGE = 0.08;
  var DRIFT = true;
  var ZOOM = 0.1;
  var SETTLE = 90;

  var canvas = document.querySelector("[data-workspace]");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var statusEl = document.querySelector("[data-workspace-status]");

  var N = parseInt(canvas.dataset.frames, 10) || 60;
  var path = canvas.dataset.path;
  var ext = canvas.dataset.ext || "webp";
  var invert = canvas.dataset.invert === "true";

  var frames = new Array(N);
  var loaded = 0;
  var dirty = true;

  function fileName(i) {
    return path + ("0000" + (i + 1)).slice(-4) + "." + ext;
  }

  function setStatus() {
    if (!statusEl) return;
    if (loaded >= N) statusEl.classList.add("is-done");
    else statusEl.textContent = "Loading " + loaded + " / " + N;
  }

  /* ---- Loading: first, last and every 20th picture, then the gaps, so it
          is usable early ---- */
  var order = [N - 1];
  var seen = {};
  seen[N - 1] = true;
  [20, 10, 5, 2, 1].forEach(function (step) {
    for (var i = 0; i < N; i += step) {
      if (!seen[i]) {
        seen[i] = true;
        order.push(i);
      }
    }
  });

  order.forEach(function (i) {
    var img = new Image();
    img.onload = function () {
      frames[i] = img;
      loaded++;
      dirty = true;
      setStatus();
    };
    img.onerror = function () {
      loaded++;
      setStatus();
    };
    img.src = fileName(i);
  });
  setStatus();

  /* ---- Size ---- */
  var cw = 0;
  var ch = 0;
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = Math.round(window.innerWidth * dpr);
    ch = Math.round(window.innerHeight * dpr);
    canvas.width = cw;
    canvas.height = ch;
    dirty = true;
  }
  window.addEventListener("resize", resize);
  resize();

  /* ---- Input ---- */
  var target = 0; // where the view is heading, 0 (far left) to 1 (far right)
  var current = 0; // where it is now
  var targetY = 0.5; // 0 = looking up, 1 = looking down
  var currentY = 0.5;
  var interacted = false;
  var lastInput = 0;

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function setFromPointer(e) {
    var t = clamp01((e.clientX / window.innerWidth - EDGE) / (1 - EDGE * 2));
    target = invert ? 1 - t : t;
    targetY = clamp01((e.clientY / window.innerHeight - EDGE) / (1 - EDGE * 2));
    interacted = true;
    lastInput = performance.now();
    settled = false;
  }
  var settled = true;
  window.addEventListener("pointermove", setFromPointer);
  window.addEventListener("pointerdown", setFromPointer);

  /* ---- Drawing ---- */
  function drawCover(img) {
    // Cover the window, enlarged a little (ZOOM) so there is spare picture
    // above and below; the mouse height decides which part is shown.
    var scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * (1 + ZOOM);
    var dw = img.naturalWidth * scale;
    var dh = img.naturalHeight * scale;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) * currentY, dw, dh);
  }

  function draw(pos) {
    var f = pos * (N - 1);
    var a = Math.floor(f);
    var b = Math.ceil(f);
    while (a > 0 && !frames[a]) a--;
    while (b < N - 1 && !frames[b]) b++;
    var fa = frames[a];
    var fb = frames[b];
    if (!fa && !fb) return;
    if (!fa) fa = fb;
    if (!fb) fb = fa;
    drawCover(fa);
    if (fb !== fa && b !== a) {
      // Blend the two neighbouring pictures while moving; once it is nearly
      // on one picture, show just that one.
      var mix = clamp01((f - a) / (b - a));
      if (mix < 0.04) return;
      if (mix > 0.96) {
        drawCover(fb);
        return;
      }
      ctx.globalAlpha = mix;
      drawCover(fb);
      ctx.globalAlpha = 1;
    }
  }

  var last = performance.now();
  function tick(now) {
    var dt = Math.min(64, now - last);
    last = now;

    // Scrolled past the picture (on the About page): it is covered, so rest.
    if (window.scrollY > window.innerHeight + 50) {
      dirty = true;
      requestAnimationFrame(tick);
      return;
    }

    if (DRIFT && !interacted) {
      target = 0.5 - 0.5 * Math.cos(now / 2600); // starts at the left, sways across
      targetY = 0.5 + 0.12 * Math.sin(now / 3400);
    }

    // When the mouse has been still for a moment, aim for the nearest single
    // picture so the view never rests between two.
    if (interacted && !settled && now - lastInput > SETTLE) {
      settled = true;
      target = Math.round(target * (N - 1)) / (N - 1);
    }

    var k = 1 - Math.pow(1 - SMOOTHING, dt / 16.7);
    var diff = target - current;
    if (Math.abs(diff) > 0.00005) {
      current += diff * k;
      dirty = true;
    }
    var diffY = targetY - currentY;
    if (Math.abs(diffY) > 0.0005) {
      currentY += diffY * k;
      dirty = true;
    }
    if (dirty) {
      dirty = false;
      draw(current);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
