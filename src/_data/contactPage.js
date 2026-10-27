// contactPage.js
// --------------
// Reads the real Contact page (src/contact.md, edited from /admin -> Pages ->
// Contact) so the playground Contact page can show the same email, phone and
// Instagram without copying them. Available in templates as
// {{ contactPage.data }} (email, phone, instagram, ...) and {{ contactPage.html }}.
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const markdown = require("markdown-it")({ html: true });

module.exports = () => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "contact.md"), "utf8");
    const { data, content } = matter(raw);
    return { data, html: markdown.render(content) };
  } catch (error) {
    console.warn("contactPage: could not read src/contact.md —", error.message);
    return { data: {}, html: "" };
  }
};
