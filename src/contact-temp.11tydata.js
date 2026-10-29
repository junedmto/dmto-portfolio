// contact-temp.11tydata.js
// The playground Contact page (src/contact-temp.md), now the real Contact
// page at /contact/. The email, phone and Instagram come from src/contact.md
// (edited from /admin -> Pages -> Contact), so the details stay in one place.
//
// The old Contact page is kept as a backup at /contact-temp/ (see
// src/contact.11tydata.js). To bring it back, swap the two permalinks.
module.exports = {
  layout: "layouts/playground.njk",
  permalink: "/contact/",
  eleventyExcludeFromCollections: true,
  bodyClass: "page-playground",
  hideFooter: true,
  noReveal: true, // this page IS the playground, so no second one at the bottom
  extraCss: ["/assets/css/playground.css"],
  extraJs: ["/assets/js/playground.bundle.js"],
};
