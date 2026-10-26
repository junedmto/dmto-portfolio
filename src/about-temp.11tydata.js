// about-temp.11tydata.js
// Settings for the unfinished lanyard About page (src/about-temp.md).
// They live here, not in the markdown file, so saving from /admin can never
// remove them. The text and photo come from the real About page (src/about.md).
//
//   permalink — the page's address: /about-temp/
//   noindex   — asks search engines to leave it out of results
//
// To make this the real About page later: change permalink below to
// "/about/" and set permalink: false in src/about.md (keep that file, it is
// where the text and photo are edited from /admin).
module.exports = {
  layout: "layouts/lanyard.njk",
  permalink: "/about-temp/",
  noindex: true,
  eleventyExcludeFromCollections: true,
  bodyClass: "page-lanyard",
  hideFooter: true,
  extraCss: ["/assets/js/lanyard.bundle.css", "/assets/css/lanyard.css"],
  extraJs: ["/assets/js/lanyard.bundle.js"],
};
