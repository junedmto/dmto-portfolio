// explore.js
// An endless gallery: every photo and video from every project, in random
// order, packed edge to edge with no gaps. Drag (or scroll the wheel) in any
// direction and it keeps going.
//
// How it works: the "world" is an endless grid whose rows and columns have
// set sizes that repeat. Only the cells near the window exist at any moment;
// cells that scroll away are removed and new ones are made as you move.
// Which picture goes in which cell is decided by a number worked out from the
// cell's position, so the same cell always shows the same picture.
//
// Things you can change:
//   UNIT_MAX   widest the "screen" is treated as (stops cells being huge on desktop)
//   COLS       column widths, as a fraction of the screen width (repeat endlessly)
//   ROWS       row heights, as a fraction of the screen width (repeat endlessly)
(function () {
  var stage = document.querySelector("[data-explore]");
  var world = document.querySelector("[data-explore-world]");
  var dataEl = document.getElementById("explore-data");
  if (!stage || !world || !dataEl) return;

  var items = [];
  try {
    items = JSON.parse(dataEl.textContent) || [];
  } catch (e) {}
  if (!items.length) return;

  var UNIT_MAX = 560;
  var COLS = [0.5, 0.5, 0.62, 0.38, 0.45, 0.55];
  var ROWS = [0.62, 0.5, 0.74, 0.56, 0.68, 0.5, 0.8];

  var unit = 1;
  var colX = []; // left edge of each column inside one repeat
  var colW = [];
  var colSum = 0;
  var rowY = [];
  var rowH = [];
  var rowSum = 0;

  function measure() {
    unit = Math.min(stage.clientWidth, UNIT_MAX);
    colSum = 0;
    COLS.forEach(function (f, i) {
      colX[i] = colSum;
      colW[i] = Math.round(f * unit);
      colSum += colW[i];
    });
    rowSum = 0;
    ROWS.forEach(function (f, i) {
      rowY[i] = rowSum;
      rowH[i] = Math.round(f * unit);
      rowSum += rowH[i];
    });
  }

  function mod(n, m) {
    return ((n % m) + m) % m;
  }
  function colLeft(c) {
    return Math.floor(c / COLS.length) * colSum + colX[mod(c, COLS.length)];
  }
  function colWidth(c) {
    return colW[mod(c, COLS.length)];
  }
  function rowTop(r) {
    return Math.floor(r / ROWS.length) * rowSum + rowY[mod(r, ROWS.length)];
  }
  function rowHeight(r) {
    return rowH[mod(r, ROWS.length)];
  }
  // the column / row that contains a position
  function colAt(x) {
    var rep = Math.floor(x / colSum);
    var rest = x - rep * colSum;
    var i = 0;
    while (i < COLS.length - 1 && rest >= colX[i + 1]) i++;
    return rep * COLS.length + i;
  }
  function rowAt(y) {
    var rep = Math.floor(y / rowSum);
    var rest = y - rep * rowSum;
    var i = 0;
    while (i < ROWS.length - 1 && rest >= rowY[i + 1]) i++;
    return rep * ROWS.length + i;
  }

  // A repeatable "random" number from a cell's position and a try number.
  var SEED = Math.floor(Math.random() * 1e9); // a fresh random order each visit
  function hash(r, c, t) {
    var h = (r * 374761393 + c * 668265263 + t * 2147483647 + SEED) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return h >>> 0;
  }

  // Which picture goes in a cell: try a few random ones and keep the one
  // whose shape is closest to the cell's, so little is cropped away.
  function pick(r, c) {
    var cellRatio = colWidth(c) / rowHeight(r);
    var best = 0;
    var bestScore = Infinity;
    for (var t = 0; t < 6; t++) {
      var i = hash(r, c, t) % items.length;
      var score = Math.abs(Math.log(items[i].r / cellRatio));
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  /* ---- Cells ---- */
  var cells = {}; // "r,c" -> { el, media, kind }

  function makeCell(r, c) {
    var it = items[pick(r, c)];
    var a = document.createElement("a");
    a.className = "explore__cell";
    a.href = withBase(it.u);
    a.setAttribute("aria-label", it.t);
    a.draggable = false;
    a.style.left = colLeft(c) + "px";
    a.style.top = rowTop(r) + "px";
    a.style.width = colWidth(c) + "px";
    a.style.height = rowHeight(r) + "px";
    var cell = { el: a, item: it, media: null };
    if (it.v) {
      // videos only play while they are on screen (see updateVideos)
    } else {
      var img = new Image();
      img.alt = "";
      img.decoding = "async";
      img.draggable = false;
      img.onload = function () {
        img.classList.add("is-in");
      };
      img.src = withBase(it.s);
      a.appendChild(img);
      cell.media = img;
    }
    world.appendChild(a);
    return cell;
  }

  // Works with the site's folder prefix (e.g. /dmto-portfolio/) too.
  var BASE = (function () {
    var link = document.querySelector('link[href*="/assets/css/explore.css"]');
    if (!link) return "";
    var href = link.getAttribute("href");
    return href.slice(0, href.indexOf("/assets/css/explore.css"));
  })();
  function withBase(p) {
    return /^https?:/.test(p) ? p : BASE + p;
  }

  var x = 0; // what is at the top-left of the window
  var y = 0;
  var vx = 0;
  var vy = 0;
  var W = 0;
  var H = 0;

  function update() {
    var margin = Math.round(unit * 0.5);
    var c0 = colAt(x - margin);
    var c1 = colAt(x + W + margin);
    var r0 = rowAt(y - margin);
    var r1 = rowAt(y + H + margin);
    var want = {};
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var key = r + "," + c;
        want[key] = true;
        if (!cells[key]) cells[key] = makeCell(r, c);
      }
    }
    for (var k in cells) {
      if (!want[k]) {
        stopVideo(cells[k]);
        world.removeChild(cells[k].el);
        delete cells[k];
      }
    }
    world.style.transform = "translate3d(" + -x + "px," + -y + "px,0)";
    updateVideos();
  }

  /* ---- Videos: small silent clips, playing only while on screen ---- */
  function startVideo(cell) {
    if (cell.media) return;
    var v = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("muted", "");
    v.preload = "auto";
    v.src = withBase(cell.item.s);
    v.addEventListener("loadeddata", function () {
      v.classList.add("is-in");
    });
    cell.el.appendChild(v);
    cell.media = v;
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }
  function stopVideo(cell) {
    if (!cell.item.v || !cell.media) return;
    cell.media.pause();
    cell.media.removeAttribute("src");
    cell.media.load();
    cell.el.removeChild(cell.media);
    cell.media = null;
  }
  function updateVideos() {
    for (var k in cells) {
      var cell = cells[k];
      if (!cell.item.v) continue;
      var left = parseFloat(cell.el.style.left) - x;
      var top = parseFloat(cell.el.style.top) - y;
      var w = parseFloat(cell.el.style.width);
      var h = parseFloat(cell.el.style.height);
      var near = left < W + 40 && left + w > -40 && top < H + 40 && top + h > -40;
      if (near) startVideo(cell);
      else stopVideo(cell);
    }
  }

  /* ---- Moving: drag with a little glide afterwards; mouse wheel too ---- */
  var dragging = false;
  var moved = 0;
  var lastX = 0;
  var lastY = 0;
  var lastT = 0;
  var raf = 0;

  function loop() {
    raf = 0;
    if (!dragging && (Math.abs(vx) > 0.02 || Math.abs(vy) > 0.02)) {
      x += vx * 16;
      y += vy * 16;
      vx *= 0.95;
      vy *= 0.95;
      update();
      raf = requestAnimationFrame(loop);
    }
  }
  function kick() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  stage.addEventListener("pointerdown", function (e) {
    dragging = true;
    moved = 0;
    vx = vy = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = performance.now();
    stage.classList.add("is-dragging");
    try {
      stage.setPointerCapture(e.pointerId);
    } catch (err) {}
  });
  stage.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX;
    var dy = e.clientY - lastY;
    var now = performance.now();
    var dt = Math.max(1, now - lastT);
    moved += Math.abs(dx) + Math.abs(dy);
    x -= dx;
    y -= dy;
    // speed in pixels per millisecond, smoothed
    vx = vx * 0.6 + (-dx / dt) * 0.4;
    vy = vy * 0.6 + (-dy / dt) * 0.4;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
    update();
  });
  function end() {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove("is-dragging");
    if (performance.now() - lastT > 80) vx = vy = 0; // held still before letting go
    kick();
  }
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);

  // A drag is not a tap: only a still, quick touch opens the project.
  stage.addEventListener(
    "click",
    function (e) {
      if (moved > 8) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  stage.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      x += e.deltaX;
      y += e.deltaY;
      vx = vy = 0;
      update();
    },
    { passive: false }
  );

  function resize() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    measure();
    // Cell sizes depend on the screen width, so rebuild them.
    for (var k in cells) {
      stopVideo(cells[k]);
      world.removeChild(cells[k].el);
    }
    cells = {};
    update();
  }
  window.addEventListener("resize", resize);

  // Start somewhere in the middle of the endless grid.
  W = stage.clientWidth;
  H = stage.clientHeight;
  measure();
  x = colSum * 3;
  y = rowSum * 3;
  update();
})();
