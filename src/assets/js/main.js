// main.js
// The only interactive behaviour on the site: clicking a gallery image on
// a project page opens it full-screen; clicking again (or Escape) closes
// it. No build step, no dependencies — this file is loaded as-is.

document.addEventListener("DOMContentLoaded", () => {
  const lightbox = document.querySelector("[data-lightbox]");
  if (!lightbox) return; // not a project page — nothing to do

  const lightboxImage = lightbox.querySelector("[data-lightbox-image]");
  const triggers = document.querySelectorAll("[data-lightbox-trigger] img");

  function open(src, alt) {
    lightboxImage.src = src;
    lightboxImage.alt = alt;
    lightbox.classList.add("is-open");
  }

  function close() {
    lightbox.classList.remove("is-open");
    lightboxImage.src = "";
  }

  triggers.forEach((img) => {
    img.addEventListener("click", () => open(img.src, img.alt));
  });

  lightbox.addEventListener("click", close);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
});
