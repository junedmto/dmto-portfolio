// lookFrames.js
// -----------------
// Finds the photos for the "look-around" About page and makes them
// available to the templates as {{ lookFrames }}.
//
// The portrait is a grid of photos (7 x 5 by default, or denser: the
// shoot helper offers 13 x 7 and 17 x 9). Each file is named
//   look-<column>-<row>.jpg      (also .jpeg, .png, .webp)
// where column runs from 0 at the LEFT of the picture and row from 0 at
// the TOP. So look-0-0.jpg is you looking toward the top-left, and the
// highest numbers are you looking toward the bottom-right. The size of the
// grid is worked out from the highest numbers found, so a denser set of
// photos just works.
//
// Put your photos in:   src/assets/img/look/
// Until you do, a set of stand-in frames from src/assets/img/look-demo/
// is used so the page can still be tried out. Missing frames are fine:
// the page falls back to the nearest photo that exists.

const fs = require("fs");
const path = require("path");

const DEMO_COLS = 7;
const DEMO_ROWS = 5;
const MAX_SIZE = 40; // ignore stray files with absurd numbers

function scan(folder, urlBase) {
  const dir = path.join(__dirname, "..", "assets", "img", folder);
  const found = new Map();
  if (!fs.existsSync(dir)) return [];
  for (const file of fs.readdirSync(dir).sort()) {
    const match = /^look-(\d+)-(\d+)\.(jpe?g|png|webp|avif|svg)$/i.exec(file);
    if (!match) continue;
    const c = Number(match[1]);
    const r = Number(match[2]);
    if (c >= MAX_SIZE || r >= MAX_SIZE) continue;
    const key = `${c},${r}`;
    if (!found.has(key)) found.set(key, { c, r, src: `${urlBase}/${file}` });
  }
  return [...found.values()];
}

module.exports = () => {
  let frames = scan("look", "/assets/img/look");
  let isDemo = false;
  let cols = 0;
  let rows = 0;
  if (frames.length === 0) {
    frames = scan("look-demo", "/assets/img/look-demo");
    isDemo = true;
    cols = DEMO_COLS;
    rows = DEMO_ROWS;
  } else {
    cols = Math.max(...frames.map((f) => f.c)) + 1;
    rows = Math.max(...frames.map((f) => f.r)) + 1;
  }
  return { cols, rows, frames, isDemo };
};
