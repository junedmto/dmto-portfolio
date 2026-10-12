// lookFrames.js
// -----------------
// Finds the photos for the "look-around" About page and makes them
// available to the templates as {{ lookFrames }}.
//
// The portrait is a 7 x 5 grid of photos. Each file is named
//   look-<column>-<row>.jpg      (also .jpeg, .png, .webp)
// where column runs 0-6 from the LEFT of the picture and row runs 0-4 from
// the TOP. So look-0-0.jpg is you looking toward the top-left, and
// look-6-4.jpg is you looking toward the bottom-right.
//
// Put your photos in:   src/assets/img/look/
// Until you do, a set of stand-in frames from src/assets/img/look-demo/
// is used so the page can still be tried out. Missing frames are fine:
// the page falls back to the nearest photo that exists.

const fs = require("fs");
const path = require("path");

const COLS = 7;
const ROWS = 5;

function scan(folder, urlBase) {
  const dir = path.join(__dirname, "..", "assets", "img", folder);
  const found = new Map();
  if (!fs.existsSync(dir)) return [];
  for (const file of fs.readdirSync(dir).sort()) {
    const match = /^look-(\d+)-(\d+)\.(jpe?g|png|webp|avif|svg)$/i.exec(file);
    if (!match) continue;
    const c = Number(match[1]);
    const r = Number(match[2]);
    if (c >= COLS || r >= ROWS) continue;
    const key = `${c},${r}`;
    if (!found.has(key)) found.set(key, { c, r, src: `${urlBase}/${file}` });
  }
  return [...found.values()];
}

module.exports = () => {
  let frames = scan("look", "/assets/img/look");
  let isDemo = false;
  if (frames.length === 0) {
    frames = scan("look-demo", "/assets/img/look-demo");
    isDemo = true;
  }
  return { cols: COLS, rows: ROWS, frames, isDemo };
};
