// work.11tydata.js
// Settings for the Work page (src/work.njk). The "Header turns white when
// scrolling" checkbox is in /admin -> Pages -> Work page (saved in
// src/_data/home.json). It counts as ticked until you untick it.
module.exports = {
  eleventyComputed: {
    headerLight: (data) => !(data.home && data.home.header_light === false),
  },
};
