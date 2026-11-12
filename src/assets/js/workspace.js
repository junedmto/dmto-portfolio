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
(function () {
  var SMOOTHING = 0.07;
  var EDGE = 0.08;
  var DRIFT = true;

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
  var interacted = false;

  function setFromX(x) {
    var t = x / window.innerWidth;
    t = (t - EDGE) / (1 - EDGE * 2);
    t = Math.max(0, Math.min(1, t));
    target = invert ? 1 - t : t;
    interacted = true;
  }
  window.addEventListener("pointermove", function (e) {
    setFromX(e.clientX);
  });
  window.addEventListener("pointerdown", function (e) {
    setFromX(e.clientX);
  });

  /* ---- Drawing ---- */
  function drawCover(img) {
    var scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    var dw = img.naturalWidth * scale;
    var dh = img.naturalHeight * scale;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
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
      ctx.globalAlpha = Math.max(0, Math.min(1, (f - a) / (b - a)));
      drawCover(fb);
      ctx.globalAlpha = 1;
    }
  }

  var last = performance.now();
  function tick(now) {
    var dt = Math.min(64, now - last);
    last = now;

    if (DRIFT && !interacted) {
      target = 0.5 - 0.5 * Math.cos(now / 2600); // starts at the left, sways across
    }

    var k = 1 - Math.pow(1 - SMOOTHING, dt / 16.7);
    var diff = target - current;
    if (Math.abs(diff) > 0.0001) {
      current += diff * k;
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
