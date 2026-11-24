// tools/explore-thumbs.js
// Shared by the "explore" page (src/explore-temp.11tydata.js) and the script
// that makes the small pictures for it (tools/make-explore-thumbs.js).
//
// Every photo or video used in a project gallery gets a small copy in
// src/assets/img/thumbs/ so the endless gallery loads quickly on a phone.
// The small copy's name is worked out from the original's path, so the page
// can find it. A photo becomes a small .jpg, a video becomes a short, small,
// silent .mp4.

const crypto = require("crypto");
const path = require("path");

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"];
const isVideo = (p) =>
  typeof p === "string" && VIDEO_EXTENSIONS.includes(path.extname(p).toLowerCase());

// "/assets/img/uploads/Spa2-1.png" -> "spa2-1-a1b2c3.jpg"
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

module.exports = { isVideo, thumbName, THUMB_URL: "/assets/img/thumbs/" };
