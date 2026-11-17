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
//   DRIFT_STOP  on touch screens the drift comes to rest after this many
//               milliseconds, so the dots stop being a moving target
//   ZOOM        how much the picture is enlarged, to leave room above and below
//               that is only shown when the mouse goes up or down (0.1 = 10%;
//               0 = no up and down movement at all)
//   SETTLE      how long the mouse must be still, in milliseconds, before the
//               view settles onto one single picture (so there is never a
//               see-through mix of two)
//   BLEND       true fades between two neighbouring pictures while the view
//               moves, which is smoother but can look see-through; false
//               jumps straight from one picture to the next
//
// The page can also carry dots pinned to things in the room (the "spots" list
// in src/workspace-temp.md). They slide along with the room as it turns, show
// a card on hover, and bring their item to the middle when clicked. To place
// new ones, open the page with ?place at the end of the address.
(function () {
  var SMOOTHING = 0.07;
  var EDGE = 0.08;
  var DRIFT = true;
  var DRIFT_STOP = 8200;
  var ZOOM = 0.1;
  var SETTLE = 90;
  var BLEND = false;

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
  var natW = 0; // the size of one picture, known once the first one has loaded
  var natH = 0;
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
      if (!natW) {
        natW = img.naturalWidth;
        natH = img.naturalHeight;
      }
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
  window.addEventListener("resize", function () {
    resize();
    measured = false; // the cards may be a different width now
  });
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
    if (pinned || hovering) return; // a dot is open or under the mouse: hold still so it can be read
    var t = clamp01((e.clientX / window.innerWidth - EDGE) / (1 - EDGE * 2));
    target = invert ? 1 - t : t;
    targetY = clamp01((e.clientY / window.innerHeight - EDGE) / (1 - EDGE * 2));
    interacted = true;
    lastInput = performance.now();
    settled = false;
  }
  var settled = true;
  var pinned = null;
  var hovering = false;
  window.addEventListener("pointermove", setFromPointer);
  window.addEventListener("pointerdown", setFromPointer);

  /* ---- Where everything is in the room --------------------------------

     PAN says how far the room has slid sideways in each picture, as a
     fraction of the picture's width. It was measured from the pictures
     themselves, so a dot placed on the lamp stays on the lamp as the room
     turns. If the animation is ever re-rendered in Blender, this table has to
     be measured again. ---------------------------------------------------- */

  var PAN = [
    0.0000, -0.0005, -0.0012, -0.0024, -0.0039, -0.0058, -0.0082, -0.0108, -0.0138, -0.0172,
    -0.0210, -0.0250, -0.0293, -0.0338, -0.0386, -0.0437, -0.0490, -0.0544, -0.0601, -0.0659,
    -0.0719, -0.0781, -0.0843, -0.0907, -0.0971, -0.1037, -0.1103, -0.1169, -0.1235, -0.1301,
    -0.1368, -0.1434, -0.1500, -0.1565, -0.1631, -0.1695, -0.1759, -0.1820, -0.1880, -0.1938,
    -0.1993, -0.2046, -0.2100, -0.2151, -0.2197, -0.2239, -0.2282, -0.2324, -0.2365, -0.2402,
    -0.2437, -0.2468, -0.2495, -0.2519, -0.2539, -0.2555, -0.2568, -0.2577, -0.2582, -0.2585
  ];

  // How far the room has slid in picture number f (f can be between two).
  function panAt(f) {
    var a = Math.max(0, Math.min(N - 1, Math.floor(f)));
    var b = Math.min(N - 1, a + 1);
    return PAN[a] + (PAN[b] - PAN[a]) * (f - a);
  }

  // The other way round: which picture has the room slid this far.
  function panInverse(g) {
    if (g >= PAN[0]) return 0;
    if (g <= PAN[N - 1]) return N - 1;
    for (var i = 1; i < N; i++) {
      if (PAN[i] <= g) {
        var span = PAN[i] - PAN[i - 1];
        return i - 1 + (span ? (g - PAN[i - 1]) / span : 0);
      }
    }
    return N - 1;
  }

  // Where the picture sits on the screen right now, in ordinary pixels.
  function view() {
    var dpr = cw / window.innerWidth || 1;
    var scale = Math.max(cw / natW, ch / natH) * (1 + ZOOM);
    var dw = natW * scale;
    var dh = natH * scale;
    return { x: (cw - dw) / 2 / dpr, y: ((ch - dh) * currentY) / dpr, w: dw / dpr, h: dh / dpr };
  }

  /* ---- The dots pinned to things in the room ---- */
  var layer = document.querySelector("[data-spots]");
  var spots = [];
  var measured = false;

  if (layer && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    Array.prototype.forEach.call(layer.querySelectorAll("[data-spot]"), function (el) {
      spots.push({
        el: el,
        x: parseFloat(el.dataset.x) || 0,
        y: parseFloat(el.dataset.y) || 0,
        frame: parseFloat(el.dataset.frame) || 0,
        depth: el.dataset.depth ? parseFloat(el.dataset.depth) : 1,
        btn: el.querySelector(".ws-spot__dot"),
        card: el.querySelector(".ws-spot__card"),
        cardW: 0,
        on: false,
        typers: Array.prototype.map.call(el.querySelectorAll("[data-type]"), function (t) {
          return { el: t, full: t.getAttribute("data-type") || "", speed: t.classList.contains("ws-spot__title") ? 34 : 16 };
        }),
        shots: Array.prototype.slice.call(el.querySelectorAll(".ws-spot__shot")),
        video: el.querySelector("[data-video]"),
        yt: el.querySelector("[data-yt]"),
        shot: 0,
        typeTimer: null,
        shotTimer: null
      });
    });
  }

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Writing the words out, as if they were being typed in the air ---- */
  function stopTyping(s) {
    if (s.typeTimer) {
      clearTimeout(s.typeTimer);
      s.typeTimer = null;
    }
    s.typers.forEach(function (t) {
      t.el.classList.remove("is-typing");
    });
  }

  function startTyping(s) {
    stopTyping(s);
    if (reduceMotion) {
      s.typers.forEach(function (t) {
        t.el.textContent = t.full;
      });
      return;
    }
    s.typers.forEach(function (t) {
      t.el.textContent = "";
    });
    var line = 0;
    var ch = 0;
    function step() {
      if (line >= s.typers.length) {
        s.typeTimer = null;
        return;
      }
      var t = s.typers[line];
      if (!t.full) {
        line++;
        step();
        return;
      }
      t.el.classList.add("is-typing");
      ch++;
      t.el.textContent = t.full.slice(0, ch);
      if (ch >= t.full.length) {
        t.el.classList.remove("is-typing");
        line++;
        ch = 0;
        s.typeTimer = setTimeout(step, 240); // a short pause between the lines
        return;
      }
      s.typeTimer = setTimeout(step, t.speed);
    }
    step();
  }

  /* ---- The little video or the photos under the words ---- */
  function tellYouTube(s, command) {
    if (!s.yt || !s.yt.contentWindow) return;
    try {
      s.yt.contentWindow.postMessage(JSON.stringify({ event: "command", func: command, args: [] }), "*");
    } catch (e) {}
  }

  function startMedia(s) {
    if (s.yt) {
      if (!s.yt.getAttribute("src")) s.yt.setAttribute("src", s.yt.getAttribute("data-yt"));
      else tellYouTube(s, "playVideo");
    }
    if (s.video) {
      var play = s.video.play();
      if (play && play.catch) play.catch(function () {});
    }
    if (s.shots.length > 1 && !s.shotTimer) {
      s.shotTimer = setInterval(function () {
        s.shots[s.shot].classList.remove("is-on");
        s.shot = (s.shot + 1) % s.shots.length;
        s.shots[s.shot].classList.add("is-on");
      }, 2300);
    }
  }

  function stopMedia(s) {
    if (s.yt && s.yt.getAttribute("src")) tellYouTube(s, "pauseVideo");
    if (s.video) s.video.pause();
    if (s.shotTimer) {
      clearInterval(s.shotTimer);
      s.shotTimer = null;
    }
  }

  // A dot is "open" while the mouse is on it or while it is held open.
  var hovered = null;
  function refreshOpen() {
    spots.forEach(function (s) {
      var open = s === pinned || s === hovered;
      if (open === s.on) return;
      s.on = open;
      if (open) {
        startTyping(s);
        startMedia(s);
      } else {
        stopTyping(s);
        stopMedia(s);
      }
    });
  }

  // Bring a dot's item to the middle of the window and hold the room there.
  function pin(s) {
    if (pinned) pinned.el.classList.remove("is-pinned");
    pinned = s;
    s.el.classList.add("is-pinned");
    if (s.btn) s.btn.setAttribute("aria-expanded", "true");
    layer.classList.add("has-pinned");
    refreshOpen();

    var f = panInverse(0.5 - s.x + panAt(s.frame));
    target = Math.round(f) / (N - 1); // a whole picture, so there is no ghosting
    var v = view();
    var H = window.innerHeight;
    if (H - v.h !== 0) targetY = clamp01((H / 2 - s.y * v.h) / (H - v.h));
    interacted = true;
    settled = true;
    dirty = true;
  }

  function unpin() {
    if (!pinned) return;
    pinned.el.classList.remove("is-pinned");
    if (pinned.btn) pinned.btn.setAttribute("aria-expanded", "false");
    pinned = null;
    layer.classList.remove("has-pinned");
    refreshOpen();
  }

  spots.forEach(function (s) {
    if (!s.btn) return;
    // The room stops turning while the mouse is on a dot or its card, so the
    // card can be read without everything sliding away.
    s.el.addEventListener("pointerenter", function (e) {
      if (e.pointerType === "mouse") {
        hovering = true; // only a real mouse; a tap must not freeze the room
        hovered = s;
        refreshOpen();
      }
    });
    s.el.addEventListener("pointerleave", function () {
      hovering = false;
      if (hovered === s) {
        hovered = null;
        refreshOpen();
      }
    });
    // Keyboard: tabbing onto a dot writes its words out too.
    s.btn.addEventListener("focus", function () {
      hovered = s;
      refreshOpen();
    });
    s.btn.addEventListener("blur", function () {
      if (hovered === s) {
        hovered = null;
        refreshOpen();
      }
    });
    s.btn.addEventListener("click", function (e) {
      e.stopPropagation();
      // A dot with a link takes you there when clicked with a mouse or the
      // keyboard. On a touch screen the first tap opens the words (so they
      // can be read) and the next tap, on the dot or on "Open page", follows.
      var go = s.el.querySelector(".ws-spot__go");
      var touch = e.pointerType === "touch" || e.pointerType === "pen";
      if (go && (!touch || pinned === s)) {
        go.click();
        return;
      }
      if (pinned === s) unpin();
      else pin(s);
    });
  });

  if (spots.length) {
    document.addEventListener("click", function (e) {
      if (pinned && !pinned.el.contains(e.target)) unpin();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") unpin();
    });
  }

  // Put every dot where its item is now.
  function updateSpots() {
    if (!spots.length || !natW) return;
    layer.classList.add("is-ready"); // the first picture is up: fade the dots in
    var v = view();
    if (!measured) {
      measured = true;
      for (var m = 0; m < spots.length; m++) {
        spots[m].cardW = spots[m].card ? spots[m].card.offsetWidth : 240;
      }
    }
    var g = panAt(current * (N - 1));
    var W = window.innerWidth;
    var H = window.innerHeight;
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i];
      var px = v.x + (s.x + s.depth * (g - panAt(s.frame))) * v.w;
      var py = v.y + s.y * v.h;
      var away = Math.min(1, Math.abs(px - W / 2) / (W / 2)); // 0 in the middle, 1 at the edge
      var onScreen = px > -40 && px < W + 40 && py > -40 && py < H + 40;
      var el = s.el;
      el.style.setProperty("--x", px.toFixed(1) + "px");
      el.style.setProperty("--y", py.toFixed(1) + "px");
      el.style.setProperty("--spot-near", (1 - 0.45 * away).toFixed(3)); // dots to the side are smaller and fainter
      el.style.visibility = onScreen ? "" : "hidden";
      // The card hangs on whichever side has room for it.
      el.classList.toggle("is-left", px + 24 + s.cardW > W - 12 && px - 24 - s.cardW > 12);
      el.classList.toggle("is-below", py < H * 0.4);
    }
  }

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
    // With blending on, the two pictures either side are faded together;
    // with it off, the nearest one is shown on its own.
    var a = BLEND ? Math.floor(f) : Math.round(f);
    var b = BLEND ? Math.ceil(f) : a;
    while (a > 0 && !frames[a]) a--;
    while (b < N - 1 && !frames[b]) b++;
    var fa = frames[a];
    var fb = frames[b];
    if (!fa && !fb) return;
    if (!fa) fa = fb;
    if (!fb) fb = fa;
    drawCover(fa);
    if (BLEND && fb !== fa && b !== a) {
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
  var startedAt = last;
  var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  var wasCovered = false;
  function tick(now) {
    var dt = Math.min(64, now - last);
    last = now;

    // Scrolled past the picture (on the About page): the white sheet covers it
    // completely. Rest, and let the playground at the bottom of the page take
    // its place (see workspace.css; it is hidden until now so it can't show
    // through the transparent opening at the top).
    var covered = window.scrollY >= window.innerHeight;
    if (covered !== wasCovered) {
      wasCovered = covered;
      document.body.classList.toggle("ws-covered", covered);
      dirty = true;
    }
    if (covered) {
      requestAnimationFrame(tick);
      return;
    }

    if (DRIFT && !interacted) {
      if (coarse && now - startedAt > DRIFT_STOP) {
        // On a phone there is no mouse to take over, so after one sway the
        // room settles in the middle and the dots can be tapped.
        target = 0.5;
        targetY = 0.5;
      } else {
        target = 0.5 - 0.5 * Math.cos(now / 2600); // starts at the left, sways across
        targetY = 0.5 + 0.12 * Math.sin(now / 3400);
      }
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
      updateSpots();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---- Placing new dots: open the page with ?place at the end ---- */
  if (layer && /[?&]place\b/.test(location.search)) {
    var panel = document.querySelector("[data-place]");
    if (panel) {
      var readout = panel.querySelector("[data-place-readout]");
      var list = panel.querySelector("[data-place-list]");
      var picked = [];

      document.body.classList.add("ws-placing");

      function toImage(clientX, clientY) {
        var v = view();
        return { x: (clientX - v.x) / v.w, y: (clientY - v.y) / v.h };
      }

      function asYaml() {
        return picked
          .map(function (p) {
            return (
              "  - x: " + p.x.toFixed(4) + "\n" +
              "    y: " + p.y.toFixed(4) + "\n" +
              "    frame: " + p.frame + "\n" +
              '    title: "Name it"\n' +
              '    text: "Say something about it."'
            );
          })
          .join("\n");
      }

      function render() {
        list.textContent = picked.length ? "spots:\n" + asYaml() : "No dots yet. Click something in the room.";
      }

      window.addEventListener("pointermove", function (e) {
        if (!natW) return;
        var p = toImage(e.clientX, e.clientY);
        readout.textContent = "x " + p.x.toFixed(3) + "  y " + p.y.toFixed(3) + "  picture " + Math.round(current * (N - 1));
      });

      canvas.addEventListener("click", function (e) {
        var p = toImage(e.clientX, e.clientY);
        picked.push({ x: p.x, y: p.y, frame: Math.round(current * (N - 1)) });
        render();
      });

      panel.querySelector("[data-place-undo]").addEventListener("click", function () {
        picked.pop();
        render();
      });

      panel.querySelector("[data-place-copy]").addEventListener("click", function (e) {
        var text = list.textContent;
        var done = function () {
          e.target.textContent = "Copied";
          setTimeout(function () {
            e.target.textContent = "Copy";
          }, 1400);
        };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
        else {
          var ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
          done();
        }
      });

      render();
    }
  }
})();

// The "i" window on the About page: a small window above the button. It opens
// and closes with the button, closes with its cross, a click anywhere else, or
// the Escape key. The page can still be scrolled while it is open.
(function () {
  var overlay = document.querySelector("[data-info]");
  var openBtn = document.querySelector("[data-info-open]");
  var closeBtn = document.querySelector("[data-info-close]");
  if (!overlay || !openBtn || !closeBtn) return;

  function isOpen() {
    return overlay.classList.contains("is-open");
  }

  function open() {
    overlay.classList.add("is-open");
    openBtn.setAttribute("aria-expanded", "true");
  }

  function close(focusButton) {
    overlay.classList.remove("is-open");
    openBtn.setAttribute("aria-expanded", "false");
    if (focusButton) openBtn.focus();
  }

  openBtn.setAttribute("aria-expanded", "false");
  openBtn.addEventListener("click", function () {
    if (isOpen()) close(false);
    else open();
  });
  closeBtn.addEventListener("click", function () {
    close(true);
  });
  document.addEventListener("click", function (e) {
    if (isOpen() && !overlay.contains(e.target) && !openBtn.contains(e.target)) close(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen()) close(true);
  });
})();
