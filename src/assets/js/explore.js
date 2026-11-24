// explore.js
// An endless gallery: every photo and video from every project, in random
// order, edge to edge with no gaps, each keeping its own proportions.
// Drag in any direction, pinch to zoom in or out.
//
// How it works: the world is made of rows stacked on top of each other (each
// row has its own height). Pictures sit side by side along a row at that
// height, so wide ones come out wide and tall ones narrow, and the row simply
// continues in both directions for as long as you scroll. Only what is near
// the window is on the page at any moment.
//
// Which picture comes next: first a project is chosen (every project equally
// likely, however many pictures it has), then one of its pictures. The same
// picture is never placed next to itself, or touching itself from the row
// above or below.
//
// Things you can change:
//   UNIT_MAX    widest the "screen" is treated as (stops rows being huge on desktop)
//   ROWS        row heights, as a fraction of the screen width (they repeat)
//   ZOOM_MIN / ZOOM_MAX   how far you can pinch out / in (1 = normal)
//   MAX_VIDEOS  most videos playing at once
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
  var ROWS = [0.5, 0.4, 0.62, 0.46, 0.56, 0.42, 0.68, 0.48];
  var ZOOM_MIN = 0.4;
  var ZOOM_MAX = 2.2;
  var MAX_VIDEOS = 4;

  // Group the pictures by project.
  var byProject = [];
  items.forEach(function (it, i) {
    (byProject[it.p] = byProject[it.p] || []).push(i);
  });
  byProject = byProject.filter(Boolean);

  var BASE = (function () {
    var link = document.querySelector('link[href*="/assets/css/explore.css"]');
    if (!link) return "";
    var href = link.getAttribute("href");
    return href.slice(0, href.indexOf("/assets/css/explore.css"));
  })();
  function withBase(p) {
    return /^https?:/.test(p) ? p : BASE + p;
  }

  /* ---- Rows ---- */
  var unit = 1;
  var rowY = [];
  var rowH = [];
  var rowSum = 0;

  function measure() {
    unit = Math.min(stage.clientWidth, UNIT_MAX);
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
  function rowTop(r) {
    return Math.floor(r / ROWS.length) * rowSum + rowY[mod(r, ROWS.length)];
  }
  function rowHeight(r) {
    return rowH[mod(r, ROWS.length)];
  }
  function rowAt(y) {
    var rep = Math.floor(y / rowSum);
    var rest = y - rep * rowSum;
    var i = 0;
    while (i < ROWS.length - 1 && rest >= rowY[i + 1]) i++;
    return rep * ROWS.length + i;
  }

  // rows[r] = { right: [ {i, x, w}, ... ] going right from x0,
  //             left:  [ ... ] going left from x0 }
  var rows = {};

  function getRow(r) {
    if (!rows[r]) {
      var x0 = -Math.floor(Math.random() * unit);
      rows[r] = { x0: x0, right: [], left: [], lo: x0, hi: x0 };
    }
    return rows[r];
  }

  // Does picture i, placed at x..x+w in row r, touch the same picture in a
  // row above or below?
  function touchesSame(r, i, x, w) {
    for (var d = -1; d <= 1; d += 2) {
      var other = rows[r + d];
      if (!other) continue;
      var lists = [other.right, other.left];
      for (var l = 0; l < 2; l++) {
        for (var n = 0; n < lists[l].length; n++) {
          var c = lists[l][n];
          if (c.i === i && c.x < x + w && c.x + c.w > x) return true;
        }
      }
    }
    return false;
  }

  function choose(r, x, neighbours) {
    var h = rowHeight(r);
    var best = 0;
    for (var tries = 0; tries < 14; tries++) {
      var group = byProject[Math.floor(Math.random() * byProject.length)];
      var i = group[Math.floor(Math.random() * group.length)];
      best = i;
      var w = items[i].r * h;
      var bad = false;
      for (var n = 0; n < neighbours.length; n++) {
        if (neighbours[n] === i) bad = true;
        // for the first few tries also avoid the same project next door
        if (tries < 8 && neighbours[n] >= 0 && items[neighbours[n]].p === items[i].p) bad = true;
      }
      if (!bad && touchesSame(r, i, x, w)) bad = true;
      if (!bad) return i;
    }
    return best;
  }

  function lastIndices(list, count) {
    var out = [];
    for (var n = list.length - 1; n >= 0 && out.length < count; n--) out.push(list[n].i);
    return out;
  }

  function growRow(r, lo, hi) {
    var row = getRow(r);
    var h = rowHeight(r);
    var guard = 0;
    while (row.hi < hi && guard++ < 200) {
      var i = choose(r, row.hi, lastIndices(row.right, 3));
      var w = Math.round(items[i].r * h);
      row.right.push({ i: i, x: row.hi, w: w });
      row.hi += w;
    }
    guard = 0;
    while (row.lo > lo && guard++ < 200) {
      var near = row.left.length ? [row.left[row.left.length - 1].i] : [];
      if (!row.left.length && row.right.length) near = [row.right[0].i];
      var j = choose(r, row.lo - 400, near);
      var wj = Math.round(items[j].r * h);
      row.left.push({ i: j, x: row.lo - wj, w: wj });
      row.lo -= wj;
    }
  }

  /* ---- The window ---- */
  var x = 0; // the world position at the window's top-left
  var y = 0;
  var z = 1; // zoom
  var W = 0;
  var H = 0;
  var cells = {}; // "r,i,x" -> { el, item, media }

  function makeCell(r, c) {
    var it = items[c.i];
    var h = rowHeight(r);
    var left = Math.round(c.x);
    var a = document.createElement("a");
    a.className = "explore__cell";
    a.href = withBase(it.u);
    a.setAttribute("aria-label", it.t);
    a.draggable = false;
    // one extra pixel of overlap so no hairline gaps show between pictures
    a.style.left = left + "px";
    a.style.top = rowTop(r) + "px";
    a.style.width = Math.round(c.x + c.w) - left + 1 + "px";
    a.style.height = h + 1 + "px";
    var cell = { el: a, item: it, media: null, cx: c.x, cy: rowTop(r), cw: c.w, ch: h };
    if (!it.v) {
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

  function update() {
    var vw = W / z;
    var vh = H / z;
    var margin = unit * 0.4;
    var r0 = rowAt(y - margin);
    var r1 = rowAt(y + vh + margin);
    var want = {};
    for (var r = r0; r <= r1; r++) {
      growRow(r, x - margin, x + vw + margin);
      var row = rows[r];
      var lists = [row.right, row.left];
      for (var l = 0; l < 2; l++) {
        for (var n = 0; n < lists[l].length; n++) {
          var c = lists[l][n];
          if (c.x + c.w < x - margin || c.x > x + vw + margin) continue;
          var key = r + "," + c.x;
          want[key] = true;
          if (!cells[key]) cells[key] = makeCell(r, c);
        }
      }
    }
    for (var k in cells) {
      if (!want[k]) {
        stopVideo(cells[k]);
        world.removeChild(cells[k].el);
        delete cells[k];
      }
    }
    world.style.transform = "scale(" + z + ") translate3d(" + -x + "px," + -y + "px,0)";
    updateVideos(vw, vh);
  }

  /* ---- Videos: small silent clips, only a few playing at a time ---- */
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
  function updateVideos(vw, vh) {
    var cx = x + vw / 2;
    var cy = y + vh / 2;
    var list = [];
    for (var k in cells) {
      var cell = cells[k];
      if (!cell.item.v) continue;
      var onScreen = cell.cx < x + vw && cell.cx + cell.cw > x && cell.cy < y + vh && cell.cy + cell.ch > y;
      if (!onScreen) {
        stopVideo(cell);
        continue;
      }
      var dx = cell.cx + cell.cw / 2 - cx;
      var dy = cell.cy + cell.ch / 2 - cy;
      list.push({ cell: cell, d: dx * dx + dy * dy });
    }
    list.sort(function (a, b) {
      return a.d - b.d;
    });
    list.forEach(function (e, n) {
      if (n < MAX_VIDEOS) startVideo(e.cell);
      else stopVideo(e.cell);
    });
  }

  /* ---- Moving: drag with a glide, pinch to zoom, wheel / trackpad ---- */
  var pointers = {}; // id -> {x, y}
  var moved = 0;
  var lastT = 0;
  var vx = 0;
  var vy = 0;
  var pinch = null; // {dist, z}
  var raf = 0;
  var lastMid = null;

  function clampZoom(v) {
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));
  }
  function ids() {
    return Object.keys(pointers);
  }
  function midpoint() {
    var k = ids();
    var a = pointers[k[0]];
    if (k.length < 2) return { x: a.x, y: a.y };
    var b = pointers[k[1]];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function spread() {
    var k = ids();
    var a = pointers[k[0]];
    var b = pointers[k[1]];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function stageXY(px, py) {
    var r = stage.getBoundingClientRect();
    return { x: px - r.left, y: py - r.top };
  }

  // Zoom to newZ, keeping the world point under (sx, sy) in place.
  function zoomAt(newZ, sx, sy) {
    newZ = clampZoom(newZ);
    var wx = x + sx / z;
    var wy = y + sy / z;
    z = newZ;
    x = wx - sx / z;
    y = wy - sy / z;
  }

  function loop() {
    raf = 0;
    if (!ids().length && (Math.abs(vx) > 0.02 || Math.abs(vy) > 0.02)) {
      x += (vx * 16) / z;
      y += (vy * 16) / z;
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
    if (!ids().length) moved = 0;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    vx = vy = 0;
    lastT = performance.now();
    stage.classList.add("is-dragging");
    try {
      stage.setPointerCapture(e.pointerId);
    } catch (err) {}
    if (ids().length === 2) {
      pinch = { dist: spread(), z: z };
      moved += 100; // a pinch is never a tap
    }
    var m = midpoint();
    lastMid = stageXY(m.x, m.y);
  });

  stage.addEventListener("pointermove", function (e) {
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var m = stageXY(midpoint().x, midpoint().y);
    var dx = m.x - lastMid.x;
    var dy = m.y - lastMid.y;
    moved += Math.abs(dx) + Math.abs(dy);
    if (ids().length >= 2 && pinch) {
      var d = spread();
      if (pinch.dist > 0) zoomAt(pinch.z * (d / pinch.dist), m.x, m.y);
    }
    // move with the fingers
    x -= dx / z;
    y -= dy / z;
    var now = performance.now();
    var dt = Math.max(1, now - lastT);
    vx = vx * 0.6 + (-dx / dt) * 0.4;
    vy = vy * 0.6 + (-dy / dt) * 0.4;
    lastT = now;
    lastMid = m;
    update();
  });

  function release(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    var left = ids();
    if (left.length === 1) {
      // one finger stays down after a pinch: carry on dragging with it
      pinch = null;
      var m = midpoint();
      lastMid = stageXY(m.x, m.y);
      vx = vy = 0;
    } else if (!left.length) {
      stage.classList.remove("is-dragging");
      pinch = null;
      if (performance.now() - lastT > 80) vx = vy = 0; // held still before letting go
      kick();
    }
  }
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);

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

  // Mouse wheel moves; ctrl + wheel (also a trackpad pinch) zooms.
  stage.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      if (e.ctrlKey) {
        var p = stageXY(e.clientX, e.clientY);
        zoomAt(z * Math.exp(-e.deltaY * 0.01), p.x, p.y);
      } else {
        x += e.deltaX / z;
        y += e.deltaY / z;
      }
      vx = vy = 0;
      update();
    },
    { passive: false }
  );

  function rebuild() {
    for (var k in cells) {
      stopVideo(cells[k]);
      world.removeChild(cells[k].el);
    }
    cells = {};
    rows = {};
  }

  function resize() {
    var oldUnit = unit;
    W = stage.clientWidth;
    H = stage.clientHeight;
    measure();
    if (oldUnit !== unit) rebuild(); // rows are sized from the screen width
    update();
  }
  window.addEventListener("resize", resize);

  W = stage.clientWidth;
  H = stage.clientHeight;
  measure();
  x = 0;
  y = rowSum * 3;
  update();
})();
