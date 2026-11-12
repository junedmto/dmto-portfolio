// about.11tydata.js
// Settings for the About page (src/about.md). They live here, not in the
// markdown file, so saving from /admin can never remove them.
// They load the workspace picture at the top and the video under the text.
module.exports = {
  bodyClass: "page-homevideo has-workspace",
  extraCss: ["/assets/css/homevideo.css", "/assets/css/workspace.css"],
  extraJs: ["/assets/js/homevideo.js", "/assets/js/workspace.js"],
};
