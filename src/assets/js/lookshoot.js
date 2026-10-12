// lookshoot.js
// --------------
// Powers /look-shoot/, the helper for taking the grid of portrait photos with
// a webcam. It lights up one dot at a time, takes a photo as you look at
// it, then offers a preview (using the same code as the About page) and a
// zip of all the photos to download.
//
// A note on direction: the photos are saved exactly as the camera sees you,
// not mirrored. When you look at a dot on the left of your screen, you turn
// toward YOUR left, which is the RIGHT side of the picture. So that photo is
// filed as a right-hand column (look-6-...), which is what makes the head on
// the About page turn toward the pointer, not away from it.

(function () {
  "use strict";

  const root = document.querySelector("[data-shoot]");
  if (!root) return;

  // The grid size and the time per dot come from the option picked on the
  // intro screen (more photos = smoother, but a longer shoot).
  let COLS = 7;
  let ROWS = 5;
  const params = new URLSearchParams(location.search);
  const FAST = params.get("fast") === "1";
  let HOLD = 1600; // ms each dot pulses before its photo

  const $ = (selector) => root.querySelector(selector);
  const intro = $("[data-intro]");
  const message = $("[data-message]");
  const bigVideo = $("[data-video-big]");
  const video = $("[data-cam]");
  const grid = $("[data-grid]");
  const status = $("[data-status]");
  const progress = $("[data-progress]");
  const flash = $("[data-flash]");
  const done = $("[data-done]");
  const previewStage = $("[data-look-stage]");
  const cameraButton = $("[data-camera]");
  const startButton = $("[data-start]");

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // -- The grid of dots ------------------------------------------------------
  let dots = [];
  let order = [];

  function buildGrid() {
    const choice = root.querySelector('input[name="size"]:checked');
    const [cols, rows] = choice.value.split("x").map(Number);
    COLS = cols;
    ROWS = rows;
    HOLD = FAST ? 150 : Number(choice.dataset.hold);
    root.style.setProperty("--hold", HOLD + "ms");

    grid.innerHTML = "";
    dots = [];
    for (let r = 0; r < ROWS; r++) {
      dots.push([]);
      for (let c = 0; c < COLS; c++) {
        const dot = document.createElement("span");
        dot.className = "shoot__dot";
        dot.style.left = 7 + c * (86 / (COLS - 1)) + "%";
        dot.style.top = 17 + r * (73 / (ROWS - 1)) + "%";
        grid.appendChild(dot);
        dots[r].push(dot);
      }
    }

    // Order: row by row, snaking left-right then right-left, so the head
    // never has to jump across the whole screen between photos.
    order = [];
    for (let r = 0; r < ROWS; r++) {
      for (let i = 0; i < COLS; i++) {
        order.push([r % 2 === 0 ? i : COLS - 1 - i, r]);
      }
    }
  }

  // -- Camera ----------------------------------------------------------------
  let stream = null;

  cameraButton.addEventListener("click", async () => {
    message.textContent = "";
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
        audio: false,
      });
    } catch (error) {
      message.textContent = "Couldn't open the camera. Check the browser allowed it for this site, and that no other app is using it.";
      return;
    }
    bigVideo.srcObject = stream;
    video.srcObject = stream;
    bigVideo.hidden = false;
    await Promise.all([bigVideo.play(), video.play()]);
    keepPlaying(video);
    cameraButton.hidden = true;
    startButton.hidden = false;
  });

  // Browsers sometimes pause a camera video on their own (for example when
  // another video showing the same camera is hidden). A paused video keeps
  // showing one frozen picture, which would make every photo identical, so
  // restart it whenever that happens.
  function keepPlaying(element) {
    element.addEventListener("pause", () => {
      if (stream && !stopped) element.play().catch(() => {});
    });
  }

  // -- Taking a photo ------------------------------------------------------------
  const photos = new Map(); // "look-6-0.jpg" -> Blob

  // Waits until the camera has delivered a new frame, so a photo is never a
  // stale picture from earlier.
  function freshFrame() {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 400);
      if ("requestVideoFrameCallback" in video) {
        video.requestVideoFrameCallback(() => { clearTimeout(timer); resolve(); });
      } else {
        setTimeout(() => { clearTimeout(timer); resolve(); }, 80);
      }
    });
  }

  async function capture() {
    if (video.paused) await video.play().catch(() => {});
    await freshFrame();
    const scale = Math.min(1, 1600 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  }

  // -- The shoot ---------------------------------------------------------------------
  let paused = false;
  let goBack = false;
  let stopped = false;

  // Waits for a time, but lets Space pause it and Backspace/Esc interrupt it.
  async function wait(ms) {
    let remaining = ms;
    while (remaining > 0) {
      await sleep(30);
      if (stopped || goBack) return;
      if (paused) { while (paused && !stopped) await sleep(50); continue; }
      remaining -= 30;
    }
  }

  function setActive(c, r) {
    const dot = dots[r][c];
    dot.classList.remove("is-active", "is-done");
    void dot.offsetWidth; // restart the shrinking animation
    dot.classList.add("is-active");
  }

  async function shoot() {
    buildGrid();
    // Let go of the big preview, so the small one is the only camera view.
    bigVideo.srcObject = null;
    intro.hidden = true;
    if (video.paused) await video.play().catch(() => {});
    root.classList.add("is-shooting");

    // Short run-up: look at the middle dot while it counts down.
    const middle = [Math.floor(COLS / 2), Math.floor(ROWS / 2)];
    setActive(middle[0], middle[1]);
    for (let n = 3; n > 0 && !stopped; n--) {
      status.textContent = "Get ready, look at the middle dot... " + n;
      await sleep(HOLD === 150 ? 50 : 900);
    }
    dots[middle[1]][middle[0]].classList.remove("is-active");

    let i = 0;
    while (i < order.length && !stopped) {
      const [screenCol, row] = order[i];
      setActive(screenCol, row);
      status.textContent = "Turn your head toward the dot";
      progress.textContent = i + 1 + " / " + order.length;
      await wait(HOLD);
      if (stopped) break;
      if (goBack) {
        goBack = false;
        dots[row][screenCol].classList.remove("is-active");
        i = Math.max(0, i - 1);
        continue;
      }

      flash.classList.remove("is-on");
      void flash.offsetWidth;
      flash.classList.add("is-on");

      // Looking at your screen-left dot means turning to your left, which
      // is the right side of an un-mirrored picture: flip the column.
      const name = "look-" + (COLS - 1 - screenCol) + "-" + row + ".jpg";
      photos.set(name, await capture());
      dots[row][screenCol].classList.remove("is-active");
      dots[row][screenCol].classList.add("is-done");
      i++;
    }

    root.classList.remove("is-shooting");
    status.textContent = "";
    progress.textContent = "";
    if (stopped) {
      location.reload(); // Esc: back to the start
      return;
    }
    done.hidden = false;
  }

  startButton.addEventListener("click", shoot);

  document.addEventListener("keydown", (event) => {
    if (!root.classList.contains("is-shooting")) return;
    if (event.code === "Space") { event.preventDefault(); paused = !paused; status.textContent = paused ? "Paused (Space to continue)" : "Turn your head toward the dot"; }
    if (event.code === "Backspace") { event.preventDefault(); goBack = true; }
    if (event.code === "Escape") { stopped = true; }
  });

  // -- Preview ------------------------------------------------------------------------
  let previewMounted = false;
  $("[data-preview]").addEventListener("click", () => {
    previewStage.hidden = false;
    if (previewMounted) return;
    previewMounted = true;
    const frames = Array.from(photos.entries()).map(([name, blob]) => {
      const match = /look-(\d+)-(\d+)\.jpg/.exec(name);
      return { c: Number(match[1]), r: Number(match[2]), src: URL.createObjectURL(blob) };
    });
    window.LookAround.mount(previewStage, { cols: COLS, rows: ROWS, frames });
  });
  $("[data-close-preview]").addEventListener("click", () => { previewStage.hidden = true; });

  // -- Download as a zip -------------------------------------------------------------------
  // A tiny zip writer (no compression: JPEGs are already compressed), so no
  // library is needed.
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  async function makeZip(entries) {
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const [name, blob] of entries) {
      const data = new Uint8Array(await blob.arrayBuffer());
      const nameBytes = encoder.encode(name);
      const crc = crc32(data);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);   // file names are UTF-8
      local.setUint16(8, 0, true);        // stored, not compressed
      local.setUint16(12, 0x21, true);    // date: 1980-01-01
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      parts.push(new Uint8Array(local.buffer), nameBytes, data);

      const head = new DataView(new ArrayBuffer(46));
      head.setUint32(0, 0x02014b50, true);
      head.setUint16(4, 20, true);
      head.setUint16(6, 20, true);
      head.setUint16(8, 0x0800, true);
      head.setUint16(14, 0x21, true);
      head.setUint32(16, crc, true);
      head.setUint32(20, data.length, true);
      head.setUint32(24, data.length, true);
      head.setUint16(28, nameBytes.length, true);
      head.setUint32(42, offset, true);
      central.push(new Uint8Array(head.buffer), nameBytes);

      offset += 30 + nameBytes.length + data.length;
    }
    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
  }

  $("[data-download]").addEventListener("click", async () => {
    const entries = Array.from(photos.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
    const zip = await makeZip(entries);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(zip);
    link.download = "look-photos.zip";
    link.click();
  });

  $("[data-retake]").addEventListener("click", () => location.reload());
})();
