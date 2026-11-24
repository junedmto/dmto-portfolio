// tools/optimize-media.js
// Runs automatically before every build (see "build" in package.json).
//
// It makes the small copies of project photos and videos that the Explore
// page uses (src/assets/img/thumbs/): a small .jpg for every photo and a
// short, small, silent .mp4 for every video. Copies that already exist are
// left alone, so after the first time only new uploads take any time.
//
// It needs ffmpeg (GitHub's build machines have it). If ffmpeg is missing it
// just says so and the build carries on; the Explore page then uses the
// full-size files.
//
// You can also run it yourself:   node tools/optimize-media.js

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile, execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "src/assets/img/thumbs");

const isVideo = (p) => [".mp4", ".webm", ".mov", ".m4v"].includes(path.extname(p).toLowerCase());
// Same naming as src/explore.11tydata.js
function thumbName(src) {
  const base = path
    .basename(src)
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const hash = crypto.createHash("md5").update(src).digest("hex").slice(0, 6);
  return `${base}-${hash}.${isVideo(src) ? "mp4" : "jpg"}`;
}

function haveFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

function galleryPaths() {
  const dir = path.join(root, "src/projects");
  const out = new Set();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    if (/^draft:\s*true/m.test(text)) continue;
    const m = text.match(/^gallery:\s*\n((?:[ \t]+-.*\n?)+)/m);
    if (!m) continue;
    for (const line of m[1].split("\n")) {
      const mm = line.match(/^\s+-\s+(?:image:\s*)?['"]?(.*?)['"]?\s*$/);
      if (mm && mm[1]) out.add(mm[1]);
    }
  }
  return out;
}

function run(args) {
  return new Promise((resolve) => {
    execFile("ffmpeg", args, { maxBuffer: 1 << 24 }, (err) => resolve(!err));
  });
}

async function main() {
  if (!haveFfmpeg()) {
    console.log("[media] ffmpeg not found: skipping the small copies for the Explore page.");
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const jobs = [];
  for (const src of galleryPaths()) {
    const input = path.join(root, "src", src.replace(/^\//, ""));
    const out = path.join(outDir, thumbName(src));
    if (!fs.existsSync(input) || fs.existsSync(out)) continue;
    const args = isVideo(src)
      ? ["-y", "-v", "error", "-i", input, "-t", "8", "-an",
         "-vf", "scale='min(480,iw)':-2,fps=15", "-c:v", "libx264", "-crf", "31",
         "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
      : ["-y", "-v", "error", "-i", input, "-vf", "scale='min(640,iw)':-2",
         "-frames:v", "1", "-q:v", "5", out];
    jobs.push({ src, out, args });
  }
  let made = 0;
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const j = jobs[next++];
      const ok = await run(j.args);
      if (ok) made++;
      else {
        console.warn("[media] could not make a small copy of", j.src);
        try { fs.unlinkSync(j.out); } catch (e) {}
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log(`[media] Explore page: ${made} new small copies (${jobs.length ? "" : "nothing new to make"}).`);
}

main().catch((e) => console.warn("[media] skipped:", e.message)).then(() => process.exit(0));
