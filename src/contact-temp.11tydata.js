// contact-temp.11tydata.js
// Settings for the unfinished playground Contact page (src/contact-temp.md).
// They live here, not in the markdown file, so saving from /admin can never
// remove them. The email, phone and Instagram come from the real Contact
// page (src/contact.md), so editing Contact in /admin updates both pages.
//
//   permalink — the page's address: /contact-temp/
//   noindex   — asks search engines to leave it out of results
//
// To make this the real Contact page later: change permalink below to
// "/contact/" and set permalink: false in src/contact.md (keep that file, it
// is where the details are edited from /admin).
module.exports = {
  layout: "layouts/playground.njk",
  permalink: "/contact-temp/",
  noindex: true,
  eleventyExcludeFromCollections: true,
  bodyClass: "page-playground",
  hideFooter: true,
  extraCss: ["/assets/css/playground.css"],
  extraJs: ["/assets/js/playground.bundle.js"],
};
