// .eleventy.js
// This file configures Eleventy (the static site generator that turns the
// Markdown files you (or the /admin CMS) write into the actual HTML pages
// that get published. You shouldn't need to touch this file day-to-day —
// it only needs changes if you want to change the site's folder structure
// or add new build behaviour.

const fs = require("fs");
const path = require("path");
const { imageSize } = require("image-size");
const { execFileSync } = require("child_process");

// ffprobe (bundled via the "ffprobe-static" package) reads a video's
// dimensions at build time, the same way image-size does for photos.
let ffprobePath = null;
try {
  ffprobePath = require("ffprobe-static").path;
} catch (error) {
  ffprobePath = "ffprobe"; // fall back to one installed on the machine
}

// File types treated as video in a gallery; everything else is an image.
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"];
const isVideoPath = (p) =>
  typeof p === "string" && VIDEO_EXTENSIONS.includes(path.extname(p).toLowerCase());

// A gallery entry can be a plain path string (what the CMS writes) or an
// {image: path} object (older hand-written files). This returns the path.
const entryPath = (entry) => (entry && entry.image ? entry.image : entry);

module.exports = function (eleventyConfig) {
  // Copy these folders/files straight into the output as-is (no processing).
  // This is how CSS, JS, and any images you upload through the CMS end up
  // on the live site.
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("admin");
  eleventyConfig.addPassthroughCopy({ "src/favicon.svg": "favicon.svg" });

  // Makes {{ currentYear }} available in any template — used in the footer.
  eleventyConfig.addGlobalData("currentYear", () => new Date().getFullYear());

  // Makes {{ hasLogo }} available in any template. True only if a real
  // file exists at the path set in src/_data/site.json's "logo" value —
  // so the nav shows your logo automatically once you add that file,
  // and safely falls back to the text wordmark until then (rather than
  // a broken image icon).
  eleventyConfig.addGlobalData("hasLogo", () => {
    const site = require("./src/_data/site.json");
    if (!site.logo) return false;
    const diskPath = path.join(__dirname, "src", site.logo.replace(/^\//, ""));
    return fs.existsSync(diskPath);
  });

  // aspectRatio: given an image path as stored by the CMS (e.g.
  // "/assets/img/uploads/photo.jpg"), reads the actual file on disk and
  // returns its width divided by its height.
  //
  // This is what makes the justified gallery layout work: knowing each
  // image's true shape at build time lets the CSS size every row so the
  // images in it share one height and fill the full width — without ever
  // cropping or distorting them. Results are cached so an image used
  // several times is only measured once.
  const imageRatioCache = new Map();
  eleventyConfig.addFilter("aspectRatio", (imagePath) => {
    const FALLBACK = 1.5; // used if the file can't be read
    if (!imagePath || typeof imagePath !== "string") return FALLBACK;
    if (imageRatioCache.has(imagePath)) return imageRatioCache.get(imagePath);

    // The CMS stores paths as site URLs ("/assets/..."), but on disk
    // they live under "src/assets/...".
    const diskPath = path.join(__dirname, "src", imagePath.replace(/^\//, ""));

    let ratio = FALLBACK;
    try {
      if (isVideoPath(imagePath)) {
        // Video: ask ffprobe for the size, and swap width/height if the
        // clip is stored rotated (typical of phone footage).
        const out = execFileSync(
          ffprobePath,
          ["-v", "error", "-select_streams", "v:0", "-print_format", "json",
           "-show_streams",
           diskPath],
          { encoding: "utf8" }
        );
        const stream = JSON.parse(out).streams[0];
        let { width, height } = stream;
        const rotation = Math.abs(
          Number((stream.side_data_list && stream.side_data_list[0] && stream.side_data_list[0].rotation) ||
                 (stream.tags && stream.tags.rotate) || 0)
        );
        if (rotation === 90 || rotation === 270) [width, height] = [height, width];
        if (width && height) ratio = width / height;
      } else {
        const { width, height } = imageSize(fs.readFileSync(diskPath));
        if (width && height) ratio = width / height;
      }
    } catch (error) {
      // File missing or unreadable (e.g. a broken path in a project
      // file) — fall back rather than failing the whole build. For
      // videos, the page also corrects itself in the browser (main.js).
      console.warn(`[aspectRatio] could not measure ${imagePath}`);
    }

    imageRatioCache.set(imagePath, ratio);
    return ratio;
  });

  // isVideo: true if a gallery entry points at a video file.
  eleventyConfig.addFilter("isVideo", (entry) => isVideoPath(entryPath(entry)));

  // galleryRows: turns a project's gallery into rows ready to display.
  //
  // "layout" is the optional "Photos per row" text from the CMS, e.g.
  // "3, 2, 4" = first row has 3 items, second row 2, third row 4. Any
  // items left over after the layout runs out are laid out automatically
  // (as many per row as fit nicely). With no layout at all, the whole
  // gallery is automatic, exactly as before.
  //
  // Each returned row is { manual: true|false, items: [{ src, isVideo }] }.
  eleventyConfig.addFilter("galleryRows", (gallery, layout) => {
    if (!gallery || !gallery.length) return [];
    const items = gallery.map((entry) => {
      const src = entryPath(entry);
      return { src, isVideo: isVideoPath(src) };
    });

    const counts = String(layout || "")
      .split(/[^0-9]+/)
      .map(Number)
      .filter((n) => n > 0);

    const rows = [];
    let cursor = 0;
    for (const count of counts) {
      if (cursor >= items.length) break;
      rows.push({ manual: true, items: items.slice(cursor, cursor + count) });
      cursor += count;
    }
    if (cursor < items.length) {
      rows.push({ manual: false, items: items.slice(cursor) });
    }
    return rows;
  });

  // "projects" is the collection of every project page. Order comes from
  // dragging entries around in /admin (stored as the "order" field —
  // see admin/config.yml's "reorder" option); any project that hasn't
  // been manually placed yet (no "order" set) falls back to sorting by
  // when its file was last touched (Eleventy's automatic "date", not a
  // field you set yourself), and sorts after every manually-ordered
  // project.
  eleventyConfig.addCollection("projects", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/projects/*.md")
      // Projects marked "Hidden (draft)" in the CMS stay out of the site.
      .filter((item) => !item.data.draft)
      .sort((a, b) => {
      const orderA = a.data.order;
      const orderB = b.data.order;
      if (orderA != null && orderB != null) return orderA - orderB;
      if (orderA != null) return -1;
      if (orderB != null) return 1;
      return b.date - a.date;
    });
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      output: "_site",
    },
    // Markdown files use Nunjucks for any {{ }} in the front matter/layout,
    // and Nunjucks is also our templating language for .njk files.
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
