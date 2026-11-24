// tools/optimize-output.js
// Runs automatically after every build (see "build" in package.json).
//
// It makes the published site lighter: every large .png / .jpg / .jpeg photo
// in the built site's assets/img/uploads folder is converted to a smaller
// .webp (at most 2400 pixels wide), the pages are updated to point at the new
// files, and the big originals are dropped from the published copy. Your
// originals in the project are never touched.
//
// Notes:
//   - Only photos bigger than MIN_BYTES are converted; small ones stay as they are.
//   - If a conversion fails or isn't smaller, that photo is left as it was.
//   - If ffmpeg is missing, this does nothing and the build carries on.
//   - Videos are not changed.
//
// Change QUALITY or MAX_WIDTH below to trade sharpness for size.
// You can also run it yourself after a build:   node tools/optimize-output.js

const fs = require("fs");
const path = require("path");
const { execFile, execFileSync } = require("child_process");

const OUT = path.resolve(process.env.ELEVENTY_OUT || path.join(__dirname, "..", "_site"));
const UPLOADS = path.join(OUT, "assets", "img", "uploads");
const QUALITY = 82; // 0-100, higher is sharper and bigger
const MAX_WIDTH = 2400; // pixels
const MIN_BYTES = 150 * 1024;
const IMAGE_EXT = [".png", ".jpg", ".jpeg"];
const TEXT_EXT = [".html", ".css", ".js", ".json", ".xml", ".txt", ".svg"];

function haveFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

function walk(dir, skip) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (skip && skip(p)) continue;
    if (entry.isDirectory()) out.push(...walk(p, skip));
    else out.push(p);
  }
  return out;
}

function convert(input, output) {
  return new Promise((resolve) => {
    execFile(
      "ffmpeg",
      ["-y", "-v", "error", "-i", input, "-vf", `scale='min(${MAX_WIDTH},iw)':-2`,
       "-frames:v", "1", "-c:v", "libwebp", "-quality", String(QUALITY), "-compression_level", "4", output],
      { maxBuffer: 1 << 24 },
      (err) => resolve(!err)
    );
  });
}

async function main() {
  if (!fs.existsSync(UPLOADS)) return;
  if (!haveFfmpeg()) {
    console.log("[images] ffmpeg not found: leaving the photos as they are.");
    return;
  }
  const files = walk(UPLOADS).filter(
    (f) => IMAGE_EXT.includes(path.extname(f).toLowerCase()) && fs.statSync(f).size >= MIN_BYTES
  );

  const converted = []; // { from: "/assets/img/uploads/a.png", to: ".../a.png.webp", file }
  let next = 0;
  let before = 0;
  let after = 0;
  async function worker() {
    while (next < files.length) {
      const f = files[next++];
      const out = f + ".webp";
      const ok = await convert(f, out);
      const sizeIn = fs.statSync(f).size;
      if (ok && fs.existsSync(out) && fs.statSync(out).size < sizeIn) {
        before += sizeIn;
        after += fs.statSync(out).size;
        const rel = "/" + path.relative(OUT, f).split(path.sep).join("/");
        converted.push({ from: rel, to: rel + ".webp", file: f });
      } else {
        try { fs.unlinkSync(out); } catch (e) {}
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (!converted.length) return;

  // Point every page at the new files.
  const pairs = [];
  for (const c of converted) {
    pairs.push([c.from, c.to]);
    const enc = encodeURI(c.from);
    if (enc !== c.from) pairs.push([enc, encodeURI(c.to)]);
  }
  const textFiles = walk(OUT, (p) => p === path.join(OUT, "admin")).filter((f) =>
    TEXT_EXT.includes(path.extname(f).toLowerCase())
  );
  for (const f of textFiles) {
    let text = fs.readFileSync(f, "utf8");
    let changed = false;
    for (const [from, to] of pairs) {
      if (text.includes(from)) {
        text = text.split(from).join(to);
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(f, text);
  }

  // Drop the big originals from the published copy.
  for (const c of converted) fs.unlinkSync(c.file);

  const mb = (n) => (n / 1048576).toFixed(0);
  console.log(`[images] ${converted.length} photos converted to webp: ${mb(before)} MB -> ${mb(after)} MB`);
}

main().catch((e) => console.warn("[images] skipped:", e.message)).then(() => process.exit(0));
