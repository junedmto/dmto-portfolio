// about.11tydata.js
// Settings for the About page (src/about.md). They live here, not in the
// markdown file, so saving from /admin can never remove them.
// They load the video under the text.
module.exports = {
  bodyClass: "page-homevideo",
  extraCss: ["/assets/css/homevideo.css"],
  extraJs: ["/assets/js/homevideo.js"],
};
