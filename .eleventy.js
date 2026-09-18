// .eleventy.js
// This file configures Eleventy (the static site generator that turns the
// Markdown files you (or the /admin CMS) write into the actual HTML pages
// that get published. You shouldn't need to touch this file day-to-day —
// it only needs changes if you want to change the site's folder structure
// or add new build behaviour.

module.exports = function (eleventyConfig) {
  // Copy these folders/files straight into the output as-is (no processing).
  // This is how CSS, JS, and any images you upload through the CMS end up
  // on the live site.
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("admin");
  eleventyConfig.addPassthroughCopy({ "src/favicon.svg": "favicon.svg" });

  // Makes {{ currentYear }} available in any template — used in the footer.
  eleventyConfig.addGlobalData("currentYear", () => new Date().getFullYear());

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
