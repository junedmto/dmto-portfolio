// aboutPage.js
// -----------
// Reads the real About page (src/about.md, edited from /admin -> Pages ->
// About) so the lanyard About page can show the same text and photo without
// copying them. Available in templates as {{ aboutPage.data }} (the settings:
// photo, education, publications, skills) and {{ aboutPage.html }} (the bio).
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const markdown = require("markdown-it")({ html: true, breaks: false });

module.exports = () => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "about.md"), "utf8");
    const { data, content } = matter(raw);
    return { data, html: markdown.render(content) };
  } catch (error) {
    console.warn("aboutPage: could not read src/about.md —", error.message);
    return { data: {}, html: "" };
  }
};
