// about-new.11tydata.js
// Settings for the unfinished look-around About page (src/about-new.md).
// They live here, not in the markdown file, so saving the page from /admin
// can never accidentally remove them.
//
//   permalink — the page's address: /about-new/
//   noindex   — asks search engines to leave it out of results
//   eleventyExcludeFromCollections — keeps it out of any generated lists
//
// To make this the real About page later: change permalink below to
// "/about/" and delete (or rename) the old src/about.md.
module.exports = {
  layout: "layouts/lookaround.njk",
  permalink: "/about-new/",
  noindex: true,
  eleventyExcludeFromCollections: true,
  bodyClass: "page-look",
  extraCss: ["/assets/css/look.css"],
  extraJs: ["/assets/js/lookaround.js"],
};
