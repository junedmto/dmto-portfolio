// .eleventy.js
// This file configures Eleventy (the static site generator that turns the
// Markdown files you (or the /admin CMS) write into the actual HTML pages
// that get published. You shouldn't need to touch this file day-to-day —
// it only needs changes if you want to change the site's folder structure
// or add new build behaviour.

const fs = require("fs");
const path = require("path");
const { imageSize } = require("image-size");

module.exports = function (eleventyConfig) {
  // Copy these folders/files straight into the output as-is (no processing).
  // This is how CSS, JS, and any images you upload through the CMS end up
  // on the live site.
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("admin");
  eleventyConfig.addPassthroughCopy({ "src/favicon.svg": "favicon.svg" });

  // Makes {{ currentYear }} available in any template — used in the footer.
  eleventyConfig.addGlobalData("currentYear", () => new Date().getFullYear());

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
      const { width, height } = imageSize(fs.readFileSync(diskPath));
      if (width && height) ratio = width / height;
    } catch (error) {
      // Image missing or unreadable (e.g. a broken path in a project
      // file) — fall back rather than failing the whole build.
      console.warn(`[aspectRatio] could not measure ${imagePath}`);
    }

    imageRatioCache.set(imagePath, ratio);
    return ratio;
  });

  // "projects" is the collection of every project page, newest first.
  // The homepage loops over this collection to build the work grid.
  eleventyConfig.addCollection("projects", (collectionApi) => {
    return collectionApi.getFilteredByGlob("src/projects/*.md").sort((a, b) => {
      return (b.data.date || 0) - (a.data.date || 0);
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
