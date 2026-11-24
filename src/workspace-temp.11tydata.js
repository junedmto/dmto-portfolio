// workspace-temp.11tydata.js
// Settings for the interactive workspace, which is now the HOMEPAGE (/).
// The dots and screens are edited from /admin -> Pages -> Workspace.
// To place new dots, open the homepage with ?place at the end of the address.
module.exports = {
  layout: "layouts/workspace.njk",
  permalink: "/",
  eleventyExcludeFromCollections: true,
  mobileHome: true, // on a phone this page sends you to /work/ instead
  waitForScene: true, // the loading screen stays until every picture is in
  noReveal: true, // one full-screen picture, so no playground under it
  hideFooter: true,
  bodyClass: "page-workspace",
  extraCss: ["/assets/css/workspace.css"],
  extraJs: ["/assets/js/workspace.js"],
  eleventyComputed: { title: "Department of Making" },
};
