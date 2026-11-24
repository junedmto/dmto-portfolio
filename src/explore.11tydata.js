// explore.11tydata.js
// The Explore page at /explore/ (also the homepage on phones): an endless
// gallery of every photo and video from every project, in random order, with
// no margins or gaps. Drag in any direction and it keeps going.
//
// This file collects the pictures from the projects. Small copies of each one
// live in src/assets/img/thumbs/ (made automatically at build time by tools/optimize-media.js); a
// picture without a small copy yet is used at full size instead.

const fs = require("fs");
const path = require("path");
const { imageSize } = require("image-size");
const { execFileSync } = require("child_process");
const crypto = require("crypto");

// File types treated as video; the name of a picture's small copy.
// (The same naming is used by tools/make-explore-thumbs.js.)
const THUMB_URL = "/assets/img/thumbs/";
const isVideo = (p) =>
  typeof p === "string" && [".mp4", ".webm", ".mov", ".m4v"].includes(path.extname(p).toLowerCase());
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

let ffprobePath = "ffprobe";
try {
  ffprobePath = require("ffprobe-static").path;
} catch (e) {}

const entryPath = (entry) => (entry && entry.image ? entry.image : entry);
const disk = (p) => path.join(__dirname, p.replace(/^\//, ""));

// width / height of a photo or video (cached)
const cache = new Map();
function ratioOf(src) {
  if (cache.has(src)) return cache.get(src);
  let ratio = 1.5;
  try {
    if (isVideo(src)) {
      const out = execFileSync(
        ffprobePath,
        ["-v", "error", "-select_streams", "v:0", "-print_format", "json", "-show_streams", disk(src)],
        { encoding: "utf8" }
      );
      const st = JSON.parse(out).streams[0];
      let { width, height } = st;
      const rot = Math.abs(Number((st.side_data_list && st.side_data_list[0] && st.side_data_list[0].rotation) || (st.tags && st.tags.rotate) || 0));
      if (rot === 90 || rot === 270) [width, height] = [height, width];
      ratio = width / height;
    } else {
      const { width, height } = imageSize(fs.readFileSync(disk(src)));
      ratio = width / height;
    }
  } catch (e) {}
  ratio = Math.round(ratio * 1000) / 1000;
  cache.set(src, ratio);
  return ratio;
}

module.exports = {
  layout: "layouts/explore.njk",
  permalink: "/explore/",
  eleventyExcludeFromCollections: true,
  hideFooter: true,
  noReveal: true,
  bodyClass: "page-explore",
  extraCss: ["/assets/css/explore.css"],
  extraJs: ["/assets/js/explore.js"],
  eleventyComputed: {
    exploreItems: (data) => {
      const items = [];
      let projectIndex = -1;
      for (const project of (data.collections && data.collections.projects) || []) {
        projectIndex++;
        for (const entry of project.data.gallery || []) {
          const src = entryPath(entry);
          if (typeof src !== "string" || !src) continue;
          const small = thumbName(src);
          const has = fs.existsSync(path.join(__dirname, "assets/img/thumbs", small));
          items.push({
            s: has ? THUMB_URL + small : src, // the picture to show
            r: ratioOf(src), // width / height
            v: isVideo(src) ? 1 : 0,
            p: projectIndex, // which project it belongs to (so each project gets an equal share)
            u: project.url, // tapping goes to this project
            t: project.data.title,
          });
        }
      }
      return items;
    },
  },
};
