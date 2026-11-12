// workspace-temp.11tydata.js
// Settings for the temporary interactive workspace page (/workspace-temp/).
// It is hidden from search engines and not linked from the menu.
module.exports = {
  layout: "layouts/workspace.njk",
  permalink: "/workspace-temp/",
  eleventyExcludeFromCollections: true,
  noindex: true,
  noReveal: true, // one full-screen picture, so no playground under it
  hideFooter: true,
  bodyClass: "page-workspace",
  extraCss: ["/assets/css/workspace.css"],
  extraJs: ["/assets/js/workspace.js"],
};
