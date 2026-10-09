// projects.11tydata.js
// Settings shared by every file in src/projects/ (this replaces the old
// projects.json so one setting can use a little logic).
//
//   layout / tags — every project is rendered with the project template
//                   and added to the "projects" collection.
//   permalink     — a project switched to "Hidden (draft)" in the CMS gets
//                   no page at all, so its URL doesn't exist on the live
//                   site. Switch it back and the page returns.
module.exports = {
  layout: "layouts/project.njk",
  tags: ["projects"],
  eleventyComputed: {
    permalink: (data) => (data.draft ? false : data.permalink),
  },
};
