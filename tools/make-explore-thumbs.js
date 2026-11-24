// tools/make-explore-thumbs.js
// Makes the small copies the explore page uses (see explore-thumbs.js).
// Needs ffmpeg installed. Only makes the ones that are missing, so it is safe
// to run again after adding projects:   node tools/make-explore-thumbs.js

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { isVideo, thumbName } = require("./explore-thumbs.js");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "src/assets/img/thumbs");
fs.mkdirSync(outDir, { recursive: true });

// Collect every gallery path from the project files.
const files = fs.readdirSync(path.join(root, "src/projects")).filter((f) => f.endsWith(".md"));
const paths = new Set();
for (const f of files) {
  const text = fs.readFileSync(path.join(root, "src/projects", f), "utf8");
  if (/^draft:\s*true/m.test(text)) continue;
  const m = text.match(/^gallery:\s*\n((?:\s+-.*\n?)+)/m);
  if (!m) continue;
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^\s+-\s+(?:image:\s*)?['"]?(.*?)['"]?\s*$/);
    if (mm && mm[1]) paths.add(mm[1]);
  }
}

let made = 0;
for (const src of paths) {
  const input = path.join(root, "src", src.replace(/^\//, ""));
  const out = path.join(outDir, thumbName(src));
  if (!fs.existsSync(input) || fs.existsSync(out)) continue;
  const args = isVideo(src)
    ? ["-y", "-v", "error", "-i", input, "-t", "8", "-an",
       "-vf", "scale='min(480,iw)':-2,fps=15", "-c:v", "libx264", "-crf", "31",
       "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
    : ["-y", "-v", "error", "-i", input, "-vf", "scale='min(640,iw)':-2",
       "-frames:v", "1", "-q:v", "5", out];
  try {
    execFileSync("ffmpeg", args, { stdio: "inherit" });
    made++;
    console.log("made", path.basename(out));
  } catch (e) {
    console.warn("could not make a small copy of", src);
    try { fs.unlinkSync(out); } catch (e2) {}
  }
}
console.log(`Done: ${made} new small copies.`);
