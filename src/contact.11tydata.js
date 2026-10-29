// contact.11tydata.js
// The OLD Contact page (src/contact.md), kept as a backup at /contact-temp/.
// This file is also where the email, phone and Instagram are edited from
// /admin -> Pages -> Contact, and both the new playground Contact page and
// the playground at the bottom of every page read them from here.
//
// To bring the old page back as the real one: swap the two permalinks, here
// and in src/contact-temp.11tydata.js.
module.exports = {
  permalink: "/contact-temp/",
  noindex: true,
  noReveal: true,
  eleventyExcludeFromCollections: true,
};
