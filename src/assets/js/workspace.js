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
    if (pinned || hovering || (lightbox && lightbox.open) || (book && book.open)) return; // a dot is open or under the mouse: hold still so it can be read
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
        action: el.dataset.action || "",
        mediaEl: el.querySelector(".ws-spot__media"),
        cardW: 0,
        on: false,
        typers: Array.prototype.map.call(el.querySelectorAll("[data-type]"), function (t) {
          return { el: t, full: t.getAttribute("data-type") || "", speed: t.classList.contains("ws-spot__title") ? 34 : 16 };
        }),
        shots: Array.prototype.slice.call(el.querySelectorAll(".ws-spot__shot")),
        video: el.querySelector("[data-video]"),
        yt: el.querySelector("[data-yt]"),
        title: (el.querySelector(".ws-spot__title") || {}).getAttribute ? el.querySelector(".ws-spot__title").getAttribute("data-type") : "",
        text: (el.querySelector(".ws-spot__text") || {}).getAttribute ? el.querySelector(".ws-spot__text").getAttribute("data-type") : "",
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

  // The picture or video of a dot plays in one of two places: on the laptop's
  // screen (when the laptop is big enough on screen), or, if it is not (on a
  // phone, say), under the dot's words. "m" is the set of things that play.
  function runMedia(m) {
    if (m.yt) {
      // The address is only put in place the first time it is shown.
      if (!m.yt.getAttribute("src")) m.yt.setAttribute("src", m.yt.getAttribute("data-yt"));
      else tellYouTube(m, "playVideo");
    }
    if (m.video) {
      var play = m.video.play();
      if (play && play.catch) play.catch(function () {});
    }
    if (m.shots.length > 1 && !m.shotTimer) {
      m.shotTimer = setInterval(function () {
        m.shots[m.shot].classList.remove("is-on");
        m.shot = (m.shot + 1) % m.shots.length;
        m.shots[m.shot].classList.add("is-on");
      }, 800);
    }
  }

  function haltMedia(m) {
    if (m.yt && m.yt.getAttribute("src")) tellYouTube(m, "pauseVideo");
    if (m.video) m.video.pause();
    if (m.shotTimer) {
      clearInterval(m.shotTimer);
      m.shotTimer = null;
    }
  }

  // The dot's picture or video, as a little window that pops up on the laptop.
  function laptopMedia(s) {
    if (s.lap !== undefined) return s.lap;
    s.lap = null;
    if (!featureScreen || !s.mediaEl) return null;
    var box = document.createElement("div");
    box.className = "ws-feature";
    var win = document.createElement("div");
    win.className = "ws-win";
    var bar = document.createElement("div");
    bar.className = "ws-win__bar";
    bar.innerHTML = '<span class="ws-win__lights"><i></i><i></i><i></i></span><span class="ws-win__title"></span>';
    bar.querySelector(".ws-win__title").textContent = s.title || "";
    var body = document.createElement("div");
    body.className = "ws-win__body";
    var m = { box: box, shots: [], shot: 0, video: null, yt: null, shotTimer: null };
    if (s.shots.length) {
      body.classList.add("ws-win__body--photos");
      s.shots.forEach(function (shot, i) {
        var im = document.createElement("img");
        im.className = "ws-spot__shot" + (i === 0 ? " is-on" : "");
        im.alt = "";
        im.src = shot.currentSrc || shot.src;
        body.appendChild(im);
        m.shots.push(im);
      });
    } else if (s.video) {
      var v = document.createElement("video");
      v.muted = true;
      v.loop = true;
      v.setAttribute("playsinline", "");
      v.preload = "none";
      v.src = s.video.getAttribute("src");
      body.appendChild(v);
      m.video = v;
    } else if (s.yt) {
      var f = document.createElement("iframe");
      f.setAttribute("title", "");
      f.setAttribute("tabindex", "-1");
      f.setAttribute("frameborder", "0");
      f.setAttribute("allow", "autoplay; encrypted-media");
      f.setAttribute("data-yt", s.yt.getAttribute("data-yt"));
      body.appendChild(f);
      m.yt = f;
    } else return null;
    win.appendChild(bar);
    win.appendChild(body);
    box.appendChild(win);
    featureScreen.quad.appendChild(box);
    s.lap = m;
    return m;
  }

  function startMedia(s) {
    if (laptopMode) {
      var m = laptopMedia(s);
      if (m) {
        runMedia(m);
        m.box.classList.add("is-on");
      }
    } else runMedia(s);
  }

  function stopMedia(s) {
    haltMedia(s);
    if (s.lap) {
      haltMedia(s.lap);
      s.lap.box.classList.remove("is-on");
    }
  }

  function setLaptopMode(on) {
    if (on === laptopMode) return;
    var open = spots.filter(function (s) {
      return s.on;
    });
    open.forEach(stopMedia);
    laptopMode = on;
    if (layer) layer.classList.toggle("on-laptop", on);
    open.forEach(startMedia);
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
      var go = s.el.querySelector("a.ws-spot__go");
      var touch = e.pointerType === "touch" || e.pointerType === "pen";
      if (s.action === "flipbook") {
        openBook(s);
        return;
      }
      if (s.action === "enlarge" && s.mediaEl) {
        openLightbox(s);
        return;
      }
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
      if (e.key === "Escape") {
        if (book && book.open) closeBook(true);
        else if (lightbox && lightbox.open) closeLightbox(true);
        else unpin();
      }
    });
  }

  /* ---- Making a dot's picture or video big, in the middle of the window ---- */
  var lightbox = null;

  function buildLightbox() {
    var root = document.createElement("div");
    root.className = "ws-lightbox";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-hidden", "true");
    root.innerHTML =
      '<button class="ws-lightbox__close" type="button" aria-label="Close">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="square"/></svg>' +
      "</button>" +
      '<div class="ws-lightbox__stage"></div>' +
      '<p class="ws-lightbox__title"></p>' +
      '<p class="ws-lightbox__text"></p>';
    document.body.appendChild(root);
    lightbox = {
      el: root,
      stage: root.querySelector(".ws-lightbox__stage"),
      title: root.querySelector(".ws-lightbox__title"),
      text: root.querySelector(".ws-lightbox__text"),
      open: false,
      from: null,
      timer: null
    };
    // A click anywhere (the cross included) closes it.
    root.addEventListener("click", function (e) {
      e.stopPropagation();
      closeLightbox(false);
    });
  }

  function openLightbox(s) {
    if (!lightbox) buildLightbox();
    unpin();
    hovered = null;
    refreshOpen();
    lightbox.from = s;
    lightbox.title.textContent = s.title || "";
    lightbox.text.textContent = s.text || "";
    lightbox.stage.innerHTML = "";
    if (lightbox.timer) clearInterval(lightbox.timer);
    lightbox.timer = null;

    var media = document.createElement("div");
    media.className = "ws-spot__media ws-lightbox__media";
    media.style.setProperty("--aspect", "1.7778");

    if (s.shots.length) {
      var imgs = s.shots.map(function (shot, i) {
        var im = document.createElement("img");
        im.className = "ws-spot__shot" + (i === 0 ? " is-on" : "");
        im.alt = "";
        im.src = shot.currentSrc || shot.src;
        return im;
      });
      imgs.forEach(function (im) {
        media.appendChild(im);
      });
      // The box takes the shape of the first photo.
      var probe = new Image();
      probe.onload = function () {
        if (probe.naturalWidth) media.style.setProperty("--aspect", (probe.naturalWidth / probe.naturalHeight).toFixed(4));
      };
      probe.src = imgs[0].src;
      media.style.setProperty("--aspect", "1.3333");
      if (imgs.length > 1) {
        var at = 0;
        lightbox.timer = setInterval(function () {
          imgs[at].classList.remove("is-on");
          at = (at + 1) % imgs.length;
          imgs[at].classList.add("is-on");
        }, 800);
      }
    } else if (s.video) {
      var v = document.createElement("video");
      v.muted = true;
      v.loop = true;
      v.setAttribute("playsinline", "");
      v.src = s.video.getAttribute("src");
      media.appendChild(v);
      var pl = v.play();
      if (pl && pl.catch) pl.catch(function () {});
    } else if (s.yt) {
      var f = document.createElement("iframe");
      f.setAttribute("title", "");
      f.setAttribute("tabindex", "-1");
      f.setAttribute("frameborder", "0");
      f.setAttribute("allow", "autoplay; encrypted-media");
      media.appendChild(f);
      lightbox.stage.appendChild(media);
      f.src = s.yt.getAttribute("data-yt");
      media = null;
    }
    if (media) lightbox.stage.appendChild(media);

    lightbox.open = true;
    lightbox.el.classList.add("is-open");
    lightbox.el.setAttribute("aria-hidden", "false");
    var closeBtn = lightbox.el.querySelector(".ws-lightbox__close");
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closeLightbox(viaKeyboard) {
    if (!lightbox || !lightbox.open) return;
    lightbox.open = false;
    lightbox.el.classList.remove("is-open");
    lightbox.el.setAttribute("aria-hidden", "true");
    if (lightbox.timer) clearInterval(lightbox.timer);
    lightbox.timer = null;
    // Taking the media out stops the video / YouTube.
    var from = lightbox.from;
    setTimeout(function () {
      if (!lightbox.open) lightbox.stage.innerHTML = "";
    }, 400);
    if (viaKeyboard && from && from.btn) from.btn.focus({ preventScroll: true });
  }


  /* ---- The notebook: a flipbook of real-looking pages ---- */
  /* The pages are pictures called 01.webp, 02.webp ... in the folder set by
     data-book-path / data-book-pages on the canvas (see workspace.njk). On a
     wide screen they show as an open book (two pages, the right-hand page
     turns over like paper); on a narrow phone, one page at a time. */
  var book = null;
  var BOOK_PATH = canvas.dataset.bookPath || "/assets/img/notebook/";
  var BOOK_PAGES = parseInt(canvas.dataset.bookPages, 10) || 12;
  var BOOK_TURN = 900; // milliseconds a page takes to turn

  function bookSrc(n) {
    return BOOK_PATH + (n < 10 ? "0" : "") + n + ".webp";
  }

  function buildBook() {
    var root = document.createElement("div");
    root.className = "ws-book";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-hidden", "true");
    root.setAttribute("aria-label", "The notebook");
    root.innerHTML =
      '<button class="ws-book__close" type="button" aria-label="Close">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="square"/></svg>' +
      "</button>" +
      '<div class="ws-book__desk"><div class="ws-book__book" data-book-el></div></div>' +
      '<div class="ws-book__bar">' +
      '<button class="ws-book__nav" type="button" data-book-prev aria-label="Previous page">&lt;</button>' +
      '<span class="ws-book__count" data-book-count></span>' +
      '<button class="ws-book__nav" type="button" data-book-next aria-label="Next page">&gt;</button>' +
      "</div>";
    document.body.appendChild(root);
    book = { el: root, open: false, from: null, k: 0, max: 0, busy: false, single: false, leaves: [] };
    book.bookEl = root.querySelector("[data-book-el]");
    book.count = root.querySelector("[data-book-count]");

    root.querySelector(".ws-book__close").addEventListener("click", function (e) {
      e.stopPropagation();
      closeBook(false);
    });
    root.querySelector("[data-book-prev]").addEventListener("click", function (e) {
      e.stopPropagation();
      turnBook(-1);
    });
    root.querySelector("[data-book-next]").addEventListener("click", function (e) {
      e.stopPropagation();
      turnBook(1);
    });
    // Click the right half of the book for the next page, the left half for the previous one;
    // click the dark space around it to close.
    root.addEventListener("click", function (e) {
      e.stopPropagation();
      if (book.swiped) return;
      var r = book.bookEl.getBoundingClientRect();
      var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) {
        if (!e.target.closest(".ws-book__bar")) closeBook(false);
        return;
      }
      var right = e.clientX > r.left + r.width / 2;
      turnBook(right ? 1 : -1);
    });
    // Swipe sideways to turn.
    var sx = null;
    root.addEventListener("pointerdown", function (e) {
      sx = e.clientX;
    });
    root.addEventListener("pointerup", function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx;
      sx = null;
      if (Math.abs(dx) > 60) {
        turnBook(dx < 0 ? 1 : -1);
        book.swiped = true;
        setTimeout(function () { book.swiped = false; }, 50);
      }
    });
    document.addEventListener("keydown", function (e) {
      if (!book || !book.open) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        turnBook(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        turnBook(-1);
      }
    });
  }

  function leafHTML(front, back) {
    return (
      '<div class="ws-book__face ws-book__face--front"><img src="' + front + '" alt="" draggable="false"></div>' +
      '<div class="ws-book__face ws-book__face--back">' + (back ? '<img src="' + back + '" alt="" draggable="false">' : "") + "</div>"
    );
  }

  function layoutBook() {
    var single = window.matchMedia("(max-width: 700px) and (orientation: portrait)").matches;
    book.single = single;
    book.el.classList.toggle("is-single", single);
    var b = book.bookEl;
    b.innerHTML = "";
    book.leaves = [];
    var n = BOOK_PAGES;
    var i;
    if (single) {
      for (i = 1; i <= n; i++) book.leaves.push({ f: bookSrc(i), b: null });
      book.max = n - 1;
    } else {
      var base = document.createElement("div");
      base.className = "ws-book__base";
      base.innerHTML = '<img src="' + bookSrc(1) + '" alt="" draggable="false">';
      b.appendChild(base);
      for (i = 2; i <= n; i += 2) book.leaves.push({ f: bookSrc(i), b: i + 1 <= n ? bookSrc(i + 1) : null });
      book.max = book.leaves.length - 1;
    }
    book.leaves.forEach(function (lf, j) {
      var el = document.createElement("div");
      el.className = "ws-book__leaf";
      el.innerHTML = leafHTML(lf.f, lf.b);
      b.appendChild(el);
      lf.el = el;
    });
    var gutter = document.createElement("div");
    gutter.className = "ws-book__gutter";
    b.appendChild(gutter);
    book.k = Math.min(book.k, book.max);
    book.leaves.forEach(function (lf, j) {
      setLeaf(lf, j, j < book.k, false);
    });
    updateBookCount();
  }

  function setLeaf(lf, j, flipped, animate) {
    var el = lf.el;
    el.classList.toggle("is-flipped", flipped);
    el.style.zIndex = flipped ? String(j + 1) : String(book.leaves.length - j);
    if (!animate) el.classList.remove("is-turning");
  }

  function updateBookCount() {
    var n = BOOK_PAGES;
    var txt;
    if (book.single) txt = book.k + 1 + " / " + n;
    else txt = "Pages " + (book.k * 2 + 1) + "–" + Math.min(n, book.k * 2 + 2) + " / " + n;
    book.count.textContent = txt;
    book.el.querySelector("[data-book-prev]").disabled = book.k <= 0;
    book.el.querySelector("[data-book-next]").disabled = book.k >= book.max;
  }

  function turnBook(dir) {
    if (!book || !book.open || book.busy) return;
    var next = book.k + dir;
    if (next < 0 || next > book.max) return;
    var j = dir > 0 ? book.k : next; // the leaf that moves
    var lf = book.leaves[j];
    book.busy = true;
    lf.el.classList.add("is-turning");
    lf.el.style.zIndex = "200"; // on top while it moves
    // Force the start state to register, then flip.
    void lf.el.offsetWidth;
    lf.el.classList.toggle("is-flipped", dir > 0);
    book.k = next;
    updateBookCount();
    setTimeout(function () {
      setLeaf(lf, j, dir > 0, false);
      book.busy = false;
    }, BOOK_TURN + 40);
  }

  function openBook(s) {
    if (!book) buildBook();
    unpin();
    book.from = s;
    book.k = 0;
    book.busy = false;
    layoutBook();
    // Fit the book to the first page's real shape once it is known.
    var probe = new Image();
    probe.onload = function () {
      if (probe.naturalWidth) book.el.style.setProperty("--page-ratio", (probe.naturalWidth / probe.naturalHeight).toFixed(4));
    };
    probe.src = bookSrc(1);
    // Fetch the rest of the pages so turning never waits.
    for (var i = 2; i <= BOOK_PAGES; i++) new Image().src = bookSrc(i);
    book.open = true;
    book.el.classList.add("is-open");
    book.el.setAttribute("aria-hidden", "false");
    book.el.querySelector(".ws-book__close").focus({ preventScroll: true });
  }

  function closeBook(viaKeyboard) {
    if (!book || !book.open) return;
    book.open = false;
    book.el.classList.remove("is-open");
    book.el.setAttribute("aria-hidden", "true");
    var from = book.from;
    if (viaKeyboard && from && from.btn) from.btn.focus({ preventScroll: true });
  }

  window.addEventListener("resize", function () {
    if (book && book.open && !book.busy) {
      var single = window.matchMedia("(max-width: 700px) and (orientation: portrait)").matches;
      if (single !== book.single) {
        // keep roughly the same place in the book when the layout changes
        book.k = single ? Math.min(BOOK_PAGES - 1, book.k * 2) : Math.floor(book.k / 2);
        layoutBook();
      }
    }
  });

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

  /* ---- The two screens ------------------------------------------------

     The laptop screen and the big monitor can play a video (or show a
     picture) that stays stuck to them as the room turns. Where their four
     corners are in each of the 60 pictures was measured from the pictures
     themselves (like PAN above), and the video is bent to fit those corners.
     The thermos that slides in front of the monitor on the right is cut out
     of it, so it stays in front. If the animation is ever re-rendered in
     Blender, these tables have to be measured again.

     Each row is the four corners (left-top, right-top, right-bottom,
     left-bottom) as x, y fractions of the picture, one row per picture.
     THERMOS rows are left and right at the top, left and right at the
     bottom, and the top. ------------------------------------------------- */

  var TRACK = {"laptop":[[0.5011,0.2839,0.7884,0.2868,0.7822,0.6173,0.4956,0.5989],[0.5007,0.2842,0.7885,0.2868,0.7817,0.6171,0.4951,0.5986],[0.5,0.2844,0.7879,0.2868,0.7808,0.6169,0.4943,0.5984],[0.4988,0.2845,0.7864,0.2868,0.7795,0.6166,0.4931,0.5983],[0.4973,0.2845,0.784,0.2868,0.7778,0.6164,0.4916,0.5983],[0.4953,0.2843,0.7807,0.2868,0.7758,0.6161,0.4899,0.5985],[0.493,0.2841,0.7766,0.2868,0.7733,0.6157,0.4877,0.5987],[0.4903,0.2841,0.772,0.2868,0.7703,0.6156,0.485,0.5989],[0.4872,0.2844,0.7671,0.2868,0.7667,0.6153,0.4819,0.5989],[0.4838,0.2844,0.7626,0.2869,0.7626,0.6154,0.4786,0.599],[0.4799,0.2846,0.758,0.2868,0.7582,0.6152,0.4749,0.5989],[0.4758,0.2844,0.7534,0.2867,0.7535,0.6149,0.4709,0.599],[0.4715,0.2844,0.7489,0.2864,0.749,0.6142,0.4667,0.599],[0.4669,0.2841,0.7443,0.2862,0.7445,0.6133,0.4624,0.599],[0.462,0.284,0.7398,0.286,0.7398,0.6123,0.4576,0.599],[0.4569,0.2843,0.7355,0.2858,0.7348,0.6114,0.4525,0.5989],[0.4515,0.2844,0.731,0.2857,0.7294,0.6105,0.4473,0.5989],[0.4459,0.2845,0.7263,0.2859,0.7237,0.6098,0.4418,0.5991],[0.4401,0.2846,0.7211,0.2859,0.7177,0.6091,0.4363,0.5993],[0.4341,0.2845,0.7152,0.2857,0.7114,0.6086,0.4305,0.5995],[0.428,0.2848,0.7089,0.2855,0.7052,0.6078,0.4246,0.5998],[0.4217,0.2849,0.7022,0.2852,0.6991,0.6071,0.4186,0.6001],[0.4153,0.285,0.6954,0.285,0.6924,0.6066,0.4124,0.6004],[0.4087,0.2852,0.6886,0.2848,0.6857,0.6061,0.4061,0.6004],[0.4021,0.2851,0.6818,0.2848,0.679,0.6056,0.3997,0.6007],[0.3954,0.285,0.6749,0.2849,0.6722,0.605,0.3932,0.601],[0.3886,0.2849,0.6678,0.2849,0.6655,0.6044,0.3866,0.6013],[0.3818,0.2848,0.6609,0.2849,0.659,0.6038,0.38,0.6016],[0.3749,0.2849,0.654,0.2849,0.6525,0.603,0.3735,0.6021],[0.368,0.2849,0.6471,0.2849,0.6458,0.6025,0.3669,0.6026],[0.3613,0.2848,0.6403,0.2849,0.6389,0.6023,0.3604,0.6031],[0.3543,0.2849,0.6335,0.2849,0.6324,0.6018,0.3536,0.6035],[0.3474,0.2849,0.6266,0.2847,0.6258,0.6014,0.3469,0.604],[0.3407,0.2851,0.6199,0.2844,0.6194,0.6008,0.3404,0.6045],[0.3345,0.2852,0.6132,0.2843,0.6131,0.6003,0.3344,0.6051],[0.3289,0.2854,0.6067,0.2842,0.607,0.5997,0.3289,0.6059],[0.3239,0.2856,0.6003,0.284,0.6009,0.5993,0.3239,0.6068],[0.3192,0.2857,0.5941,0.2841,0.5947,0.599,0.3193,0.6075],[0.315,0.2858,0.588,0.2843,0.5889,0.5988,0.315,0.6082],[0.3105,0.2859,0.582,0.2843,0.5832,0.5985,0.3105,0.6088],[0.3059,0.2858,0.5761,0.2842,0.5776,0.5984,0.3059,0.6092],[0.3013,0.2858,0.5704,0.284,0.5721,0.5982,0.3013,0.6097],[0.2968,0.2858,0.5649,0.284,0.5668,0.598,0.2968,0.6102],[0.2924,0.2858,0.5596,0.2839,0.5618,0.5977,0.2924,0.6109],[0.2878,0.2857,0.5546,0.2838,0.5567,0.5977,0.2878,0.6114],[0.2833,0.2858,0.5498,0.2838,0.5521,0.5976,0.2833,0.6119],[0.2788,0.2859,0.5454,0.2838,0.5476,0.5974,0.2788,0.6123],[0.2742,0.2862,0.541,0.2838,0.5434,0.5973,0.2742,0.6129],[0.2697,0.2864,0.5369,0.2838,0.5395,0.5972,0.2697,0.6133],[0.2651,0.2866,0.5331,0.2838,0.5359,0.5972,0.2651,0.6138],[0.2606,0.2868,0.5296,0.2839,0.5326,0.5971,0.2606,0.6143],[0.256,0.2869,0.5264,0.2838,0.5297,0.5969,0.256,0.615],[0.2515,0.2868,0.5236,0.2839,0.527,0.597,0.2515,0.6158],[0.2469,0.2868,0.5212,0.284,0.5247,0.597,0.2466,0.6159],[0.242,0.2868,0.5191,0.284,0.5227,0.597,0.2419,0.6159],[0.2373,0.2868,0.5173,0.2842,0.521,0.597,0.2378,0.6159],[0.2338,0.2868,0.5159,0.2842,0.5197,0.597,0.235,0.616],[0.2309,0.2868,0.5149,0.2842,0.5186,0.597,0.233,0.6161],[0.2287,0.2868,0.5142,0.2842,0.5179,0.597,0.2318,0.6161],[0.227,0.2868,0.5138,0.2842,0.5174,0.597,0.2315,0.6162]],"monitor":[[0.844,0.1336,1.5761,0.0733,1.5434,0.6983,0.8252,0.5473],[0.8436,0.1336,1.5751,0.0733,1.5426,0.6981,0.8248,0.5472],[0.8427,0.1337,1.5728,0.0736,1.5406,0.6975,0.824,0.5471],[0.8414,0.1337,1.5693,0.074,1.5374,0.6966,0.8227,0.547],[0.8395,0.1338,1.5644,0.0745,1.5328,0.6953,0.821,0.5468],[0.8372,0.1339,1.5583,0.0752,1.5271,0.6937,0.8188,0.5465],[0.8344,0.134,1.5506,0.0762,1.52,0.6916,0.8162,0.5462],[0.8311,0.134,1.5416,0.0773,1.5116,0.6892,0.8131,0.5459],[0.8274,0.1341,1.5319,0.0785,1.5024,0.6865,0.8096,0.5455],[0.8233,0.1343,1.5215,0.0796,1.4927,0.6837,0.8058,0.5451],[0.8188,0.1345,1.5109,0.0805,1.4832,0.6812,0.8016,0.5447],[0.814,0.1346,1.5,0.0815,1.473,0.6785,0.7971,0.5442],[0.8089,0.1348,1.4884,0.0827,1.4621,0.6757,0.7923,0.5436],[0.8035,0.135,1.4763,0.0839,1.451,0.6729,0.7872,0.543],[0.7978,0.1352,1.4636,0.0851,1.4392,0.6699,0.7818,0.5424],[0.7919,0.1354,1.4502,0.0866,1.4267,0.6665,0.7763,0.5418],[0.7857,0.1356,1.4364,0.088,1.4137,0.6631,0.7705,0.5412],[0.7793,0.1357,1.422,0.0895,1.4004,0.6594,0.7644,0.5406],[0.7727,0.1359,1.4075,0.0911,1.3869,0.6558,0.7583,0.54],[0.766,0.1361,1.393,0.0926,1.3733,0.6523,0.7519,0.5394],[0.7592,0.1362,1.3784,0.0941,1.3596,0.6488,0.7454,0.5388],[0.7522,0.1364,1.3641,0.0955,1.3462,0.6455,0.7389,0.5381],[0.7451,0.1366,1.3499,0.0968,1.3328,0.6422,0.7322,0.5375],[0.738,0.1368,1.3356,0.0981,1.3194,0.6389,0.7255,0.5369],[0.7308,0.1369,1.3216,0.0994,1.3062,0.6357,0.7187,0.5363],[0.7235,0.1371,1.3076,0.1007,1.293,0.6326,0.7118,0.5357],[0.7162,0.1373,1.2937,0.102,1.2798,0.6295,0.7049,0.5351],[0.709,0.1374,1.28,0.1032,1.267,0.6264,0.698,0.5345],[0.7017,0.1376,1.2664,0.1045,1.2542,0.6234,0.6911,0.534],[0.6945,0.1377,1.2532,0.1057,1.2416,0.6205,0.6843,0.5335],[0.6872,0.1378,1.2402,0.1068,1.2293,0.6177,0.6775,0.533],[0.6801,0.1379,1.2274,0.1079,1.2172,0.6149,0.6707,0.5326],[0.673,0.138,1.215,0.109,1.2054,0.6122,0.664,0.5321],[0.6661,0.1382,1.2028,0.1099,1.194,0.6097,0.6574,0.5317],[0.6592,0.1383,1.191,0.1109,1.1828,0.6072,0.6509,0.5313],[0.6524,0.1384,1.1795,0.1118,1.172,0.6048,0.6444,0.5309],[0.6458,0.1385,1.1683,0.1127,1.1614,0.6024,0.6381,0.5306],[0.6393,0.1385,1.1575,0.1136,1.1511,0.6001,0.6319,0.5303],[0.6329,0.1386,1.1469,0.1144,1.1411,0.5979,0.6259,0.53],[0.6267,0.1386,1.1368,0.1152,1.1314,0.5958,0.62,0.5298],[0.6207,0.1386,1.127,0.116,1.1221,0.5938,0.6143,0.5296],[0.6149,0.1387,1.1177,0.1168,1.1132,0.5918,0.6088,0.5294],[0.6093,0.1387,1.1087,0.1175,1.1047,0.59,0.6034,0.5292],[0.6038,0.1387,1.1003,0.1181,1.0966,0.5883,0.5983,0.529],[0.5987,0.1388,1.0922,0.1187,1.089,0.5867,0.5933,0.5288],[0.5937,0.1388,1.0846,0.1192,1.0817,0.5853,0.5886,0.5287],[0.589,0.1388,1.0774,0.1197,1.0749,0.5839,0.5841,0.5285],[0.5846,0.1389,1.0706,0.1202,1.0685,0.5825,0.5799,0.5285],[0.5804,0.1389,1.0643,0.1207,1.0626,0.5813,0.5758,0.5284],[0.5765,0.1389,1.0585,0.1211,1.0571,0.5802,0.5721,0.5284],[0.573,0.1389,1.0531,0.1215,1.052,0.5791,0.5686,0.5284],[0.5697,0.1389,1.0483,0.1218,1.0474,0.5782,0.5655,0.5284],[0.5668,0.1389,1.0439,0.1221,1.0433,0.5773,0.5627,0.5284],[0.5642,0.1389,1.0402,0.1224,1.0397,0.5766,0.5603,0.5283],[0.562,0.1389,1.037,0.1226,1.0366,0.576,0.5582,0.5283],[0.5602,0.1389,1.0343,0.1228,1.034,0.5755,0.5564,0.5283],[0.5587,0.1389,1.0322,0.1229,1.032,0.5751,0.5551,0.5283],[0.5577,0.1389,1.0307,0.123,1.0306,0.5749,0.5541,0.5283],[0.557,0.1389,1.0297,0.123,1.0297,0.5747,0.5534,0.5283],[0.5567,0.1389,1.0294,0.123,1.0294,0.5747,0.5532,0.5284]],"thermos":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,[0.9925,0.9787,0.9864,0.9715,0.9978,0.9985,1.0012,1.0024],[0.9896,0.9767,0.9816,0.9595,0.9983,0.9988,1.0015,1.0022],[0.9867,0.9746,0.9763,0.9481,0.9987,0.999,1.0017,1.002],[0.9838,0.9723,0.9707,0.9375,0.9991,0.9993,1.0019,1.0018],[0.9832,0.9723,0.9656,0.9268,1.0002,0.9999,1.0025,1.0017],[0.9805,0.9699,0.9594,0.9174,0.9998,0.9996,1.0022,1.0018],[0.9723,0.9619,0.9505,0.9113,0.9996,0.9996,1.0022,1.002],[0.9632,0.953,0.9431,0.904,0.9994,0.9995,1.0021,1.0022],[0.9556,0.9455,0.936,0.8971,0.9994,0.9994,1.0021,1.0023],[0.9487,0.9388,0.929,0.8907,0.9992,0.9993,1.002,1.0026],[0.9421,0.9323,0.9223,0.8844,0.9997,0.9996,1.0022,1.002],[0.9357,0.9261,0.916,0.8786,1.0019,1.0008,1.0032,0.999],[0.9294,0.92,0.9099,0.8732,1.0056,1.0027,1.0047,0.9932],[0.9236,0.9144,0.9042,0.868,1.0091,1.0039,1.0052,0.9845],[0.9181,0.909,0.8989,0.8629,1.0104,1.0033,1.0044,0.9765],[0.9131,0.9041,0.894,0.858,1.0088,1.001,1.0017,0.9707],[0.9084,0.8995,0.8894,0.8536,1.0037,0.996,0.9976,0.9669],[0.904,0.8952,0.8853,0.8495,0.9964,0.9892,0.993,0.9639],[0.8999,0.8911,0.8815,0.8459,0.9896,0.9827,0.9888,0.9608],[0.8961,0.8875,0.878,0.8428,0.984,0.9771,0.9847,0.9565],[0.8929,0.8844,0.875,0.8401,0.9798,0.9729,0.9814,0.9532],[0.8903,0.8819,0.8723,0.8378,0.9776,0.9708,0.9784,0.9506],[0.8882,0.8799,0.8702,0.8359,0.9755,0.9689,0.976,0.9486],[0.8865,0.8782,0.8686,0.8342,0.9734,0.9668,0.9741,0.9467],[0.8853,0.877,0.8673,0.8331,0.9721,0.9655,0.9727,0.9455],[0.8844,0.8761,0.8665,0.8323,0.9713,0.9646,0.9719,0.9447],[0.884,0.8756,0.8661,0.832,0.971,0.9644,0.9716,0.9444]],"thermosY":[0.3094,0.4414,0.4724]};
  var SCREEN_ASPECT = { laptop: 1.6, monitor: 2.0 }; // width / height of each real screen
  var SCREEN_UNIT = 1000; // the video is laid out this wide, then bent to the corners

  var screensLayer = document.querySelector("[data-screens]");
  var screens = [];
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var noHover = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  var featureScreen = null; // the laptop, when it is showing a dot's picture or video
  var laptopMode = false; // true while the laptop is big enough on screen to show them
  var front = null;
  var fctx = null;
  var mask = null;
  var mctx = null;
  var frontDrawn = false;

  if (screensLayer && TRACK.laptop.length === N) {
    Array.prototype.forEach.call(screensLayer.querySelectorAll("[data-screen]"), function (el) {
      var name = el.getAttribute("data-screen");
      if (!TRACK[name]) return;
      var quad = el.querySelector(".ws-screen__quad");
      quad.style.width = SCREEN_UNIT + "px";
      quad.style.height = SCREEN_UNIT / SCREEN_ASPECT[name] + "px";
      var sc = {
        el: el,
        quad: quad,
        name: name,
        track: TRACK[name],
        video: quad.querySelector("video"),
        hoverOnly: el.getAttribute("data-play") === "hover" && !noHover,
        poly: null,
        under: false,
        playing: false
      };
      screens.push(sc);
      if (el.hasAttribute("data-feature")) featureScreen = sc;
    });
  }

  function quadAt(rows, f) {
    var a = Math.max(0, Math.min(N - 1, Math.floor(f)));
    var b = Math.min(N - 1, a + 1);
    var t = f - a;
    var out = [];
    for (var i = 0; i < 8; i++) out.push(rows[a][i] + (rows[b][i] - rows[a][i]) * t);
    return out;
  }

  // The CSS matrix that bends a w x h box onto four corners (a perspective fit).
  function quadMatrix(p, w, h) {
    var x0 = p[0], y0 = p[1], x1 = p[2], y1 = p[3], x2 = p[4], y2 = p[5], x3 = p[6], y3 = p[7];
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    var dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var den = dx1 * dy2 - dx2 * dy1;
    if (!den) return "";
    var g = (dx3 * dy2 - dx2 * dy3) / den;
    var k = (dx1 * dy3 - dx3 * dy1) / den;
    var a = x1 - x0 + g * x1, b = x3 - x0 + k * x3, c = x0;
    var d = y1 - y0 + g * y1, e = y3 - y0 + k * y3, f = y0;
    return "matrix3d(" + [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, c, f, 0, 1].join(",") + ")";
  }

  function insideQuad(poly, x, y) {
    var sign = 0;
    for (var i = 0; i < 4; i++) {
      var ax = poly[i * 2], ay = poly[i * 2 + 1];
      var bx = poly[((i + 1) % 4) * 2], by = poly[((i + 1) % 4) * 2 + 1];
      var cr = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (cr !== 0) {
        var sg = cr > 0 ? 1 : -1;
        if (sign && sg !== sign) return false;
        sign = sg;
      }
    }
    return true;
  }

  function playScreen(sc, wanted) {
    if (!sc.video || sc.playing === wanted) return;
    sc.playing = wanted;
    if (wanted) {
      var pl = sc.video.play();
      if (pl && pl.catch) pl.catch(function () {});
    } else sc.video.pause();
  }

  // Over a screen set to "only when the mouse is over it", the video plays.
  window.addEventListener("pointermove", function (e) {
    for (var i = 0; i < screens.length; i++) {
      var sc = screens[i];
      if (!sc.hoverOnly || !sc.poly) continue;
      var on = insideQuad(sc.poly, e.clientX, e.clientY);
      if (on !== sc.under) {
        sc.under = on;
        playScreen(sc, on);
      }
    }
  });

  function updateScreens() {
    if (!screens.length || !natW) return;
    screensLayer.classList.add("is-ready");
    var v = view();
    var W = window.innerWidth;
    var H = window.innerHeight;
    var f = BLEND ? current * (N - 1) : Math.round(current * (N - 1));
    var monitorShown = false;
    for (var i = 0; i < screens.length; i++) {
      var sc = screens[i];
      var q = quadAt(sc.track, f);
      var p = [];
      for (var j = 0; j < 4; j++) {
        p.push(v.x + q[j * 2] * v.w, v.y + q[j * 2 + 1] * v.h);
      }
      sc.poly = p;
      var minX = Math.min(p[0], p[2], p[4], p[6]);
      var maxX = Math.max(p[0], p[2], p[4], p[6]);
      var minY = Math.min(p[1], p[3], p[5], p[7]);
      var maxY = Math.max(p[1], p[3], p[5], p[7]);
      var shown = maxX > 0 && minX < W && maxY > 0 && minY < H;
      sc.el.style.visibility = shown ? "" : "hidden";
      if (!shown) {
        playScreen(sc, false);
        continue;
      }
      sc.quad.style.transform = quadMatrix(p, SCREEN_UNIT, SCREEN_UNIT / SCREEN_ASPECT[sc.name]);
      if (sc.video && !reducedMotion && !sc.hoverOnly) playScreen(sc, true);

      if (sc.name === "monitor" && !sc.el.hasAttribute("data-feature")) monitorShown = true;
    }

    // Is the laptop big enough on screen to show a dot's picture or video?
    if (featureScreen && featureScreen.poly) {
      var fp = featureScreen.poly;
      var bx0 = Math.min(fp[0], fp[2], fp[4], fp[6]);
      var bx1 = Math.max(fp[0], fp[2], fp[4], fp[6]);
      var by0 = Math.min(fp[1], fp[3], fp[5], fp[7]);
      var by1 = Math.max(fp[1], fp[3], fp[5], fp[7]);
      var vis = (Math.max(0, Math.min(bx1, W) - Math.max(bx0, 0)) * Math.max(0, Math.min(by1, H) - Math.max(by0, 0))) / ((bx1 - bx0) * (by1 - by0) || 1);
      setLaptopMode(laptopMode ? vis > 0.45 : vis > 0.7);
    }

    updateFront(v, f, monitorShown);
  }

  /* The thermos in front of the monitor: the same picture is drawn again over
     the video, cut out around the thermos with a soft edge (its edge is out of
     focus in the picture, so a hard cut would look wrong). */
  function updateFront(v, f, monitorShown) {
    var t = monitorShown ? TRACK.thermos[Math.max(0, Math.min(N - 1, Math.round(f)))] : null;
    if (!t) {
      if (frontDrawn && fctx) fctx.clearRect(0, 0, front.width, front.height);
      frontDrawn = false;
      return;
    }
    if (!front) {
      front = document.createElement("canvas");
      front.className = "ws-front";
      screensLayer.appendChild(front);
      fctx = front.getContext("2d");
      mask = document.createElement("canvas");
      mctx = mask.getContext("2d");
    }
    if (front.width !== cw || front.height !== ch) {
      front.width = mask.width = cw;
      front.height = mask.height = ch;
    }
    var i = Math.max(0, Math.min(N - 1, Math.round(f)));
    while (i > 0 && !frames[i]) i--;
    var img = frames[i];
    if (!img) return;

    var k = cw / window.innerWidth;
    var Y = TRACK.thermosY; // lid top, lid bottom, body top (fractions of the picture's height)
    var grow = -2 * k; // a little inside the edge, so none of the old screen shows around it
    function px(x) {
      return (v.x + x * v.w) * k;
    }
    function py(y) {
      return (v.y + y * v.h) * k;
    }
    var ty = py(Y[0]) - grow;
    var yb = py(Y[1]);
    var yc = py(Y[2]);
    var by = py(1) + 40 * k;
    var L = [px(t[0]) - grow, px(t[1]) - grow, px(t[2]) - grow, px(t[3]) - grow];
    var R = [px(t[4]) + grow, px(t[5]) + grow, px(t[6]) + grow, px(t[7]) + grow];
    var r = Math.max(2, Math.min(28 * k, (R[0] - L[0]) * 0.2));

    // a soft-edged shape of the thermos, drawn as a shadow so it works everywhere
    var BIG = cw + 600;
    mctx.clearRect(0, 0, mask.width, mask.height);
    mctx.save();
    mctx.shadowColor = "#fff";
    mctx.shadowBlur = 9 * k;
    mctx.shadowOffsetX = BIG;
    mctx.fillStyle = "#fff";
    mctx.translate(-BIG, 0);
    mctx.beginPath();
    mctx.moveTo(L[0], ty + r);
    mctx.quadraticCurveTo(L[0], ty, L[0] + r, ty);
    mctx.lineTo(R[0] - r, ty);
    mctx.quadraticCurveTo(R[0], ty, R[0], ty + r);
    mctx.lineTo(R[1], yb);
    mctx.lineTo(R[2], yc);
    mctx.lineTo(R[3] + (R[3] - R[2]) * ((by - py(1)) / (py(1) - yc)), by);
    mctx.lineTo(L[3] + (L[3] - L[2]) * ((by - py(1)) / (py(1) - yc)), by);
    mctx.lineTo(L[2], yc);
    mctx.lineTo(L[1], yb);
    mctx.closePath();
    mctx.fill();
    mctx.restore();

    fctx.clearRect(0, 0, front.width, front.height);
    fctx.save();
    fctx.beginPath();
    // whole pixels, so the edge of the rectangle leaves no faint line
    var rx0 = Math.floor(Math.min(L[0], L[1], L[2], L[3]) - 30 * k);
    var ry0 = Math.floor(ty - 30 * k);
    fctx.rect(rx0, ry0, Math.ceil(Math.max(R[0], R[1], R[2], R[3]) + 30 * k) - rx0, Math.ceil(by + 30 * k) - ry0);
    fctx.clip();
    drawCover(img, fctx);
    fctx.globalCompositeOperation = "destination-in";
    fctx.drawImage(mask, 0, 0);
    fctx.globalCompositeOperation = "source-over";
    fctx.restore();
    frontDrawn = true;
  }

  /* ---- Drawing ---- */
  function drawCover(img, onto) {
    // Cover the window, enlarged a little (ZOOM) so there is spare picture
    // above and below; the mouse height decides which part is shown.
    var scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * (1 + ZOOM);
    var dw = img.naturalWidth * scale;
    var dh = img.naturalHeight * scale;
    (onto || ctx).drawImage(img, (cw - dw) / 2, (ch - dh) * currentY, dw, dh);
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
      updateScreens();
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
