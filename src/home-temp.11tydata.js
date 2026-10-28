// home-temp.11tydata.js
// Settings for the unfinished video homepage (src/home-temp.md).
// They live here, not in the markdown file, so saving from /admin can never
// remove them. The video itself is the "youtube" line in home-temp.md.
//
//   permalink — the page's address: /home-temp/
//   noindex   — asks search engines to leave it out of results
//
// To make this the real homepage later: rename src/index.njk to something
// else (or delete it), and change permalink below to "/".
module.exports = {
  layout: "layouts/homevideo.njk",
  permalink: "/home-temp/",
  noindex: true,
  eleventyExcludeFromCollections: true,
  bodyClass: "page-homevideo",
  extraCss: ["/assets/css/homevideo.css"],
  extraJs: ["/assets/js/homevideo.js"],
};
