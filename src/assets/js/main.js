// main.js
// The only interactive behaviour on the site, in a few small pieces:
//   1. Clicking a gallery image on a project page opens it full-screen;
//      clicking again (or Escape) closes it.
//   2. On the Contact page, keeps the scrolling greeting moving at a
//      steady speed whatever the length of the text.
// No build step, no dependencies — this file is loaded as-is.

// -- 3. Gallery videos -----------------------------------------------------
// Videos autoplay silently and loop. Clicking one pauses or resumes it.
// Once a video's real size is known, the tile's shape is corrected if the
// build-time guess was off, so nothing is ever cropped.
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("video[data-video]").forEach((video) => {
    const tile = video.parentElement;
    video.addEventListener("loadedmetadata", () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const ratio = video.videoWidth / video.videoHeight;
      const current = parseFloat(tile.style.aspectRatio);
      if (Math.abs(ratio - current) > 0.02) {
        tile.style.aspectRatio = ratio;
        if (tile.style.flexGrow) tile.style.flexGrow = ratio * 1000;
      }
    });
    tile.addEventListener("click", () => {
      video.paused ? video.play() : video.pause();
    });
  });

  // Sound buttons: videos always start muted (browsers block autoplay
  // with sound), and a click on the button switches sound on or off.
  // Only one video plays with sound at a time.
  const buttons = document.querySelectorAll("[data-sound-toggle]");

  function setSound(button, on) {
    const video = button.parentElement.querySelector("video");
    video.muted = !on;
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
    if (on && video.paused) video.play();
  }

  buttons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation(); // don't also pause the video
      const turningOn = !button.classList.contains("is-on");
      buttons.forEach((other) => setSound(other, false));
      setSound(button, turningOn);
    });
  });
});

// -- 2. Scrolling greeting speed ------------------------------------------
// The scrolling itself is a CSS animation (see .marquee in style.css). CSS
// can't work out "how long should one loop take at a given speed", so this
// measures the text and sets the loop duration to match. If this script
// doesn't run, the CSS falls back to a fixed 60-second loop.
document.addEventListener("DOMContentLoaded", () => {
  const track = document.querySelector(".marquee__track");
  if (!track) return; // not the Contact page

  const group = track.querySelector(".marquee__group");
  const PIXELS_PER_SECOND = 110; // raise to scroll faster, lower for slower

  function setSpeed() {
    track.style.setProperty(
      "--marquee-duration",
      group.offsetWidth / PIXELS_PER_SECOND + "s"
    );
  }

  setSpeed();
  window.addEventListener("resize", setSpeed);
  // The text gets wider once the web font has loaded, so measure again.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(setSpeed);
  }
});

// -- 1. Gallery image viewer ----------------------------------------------

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


/* The header strip turns white once the page is scrolled (only on pages that
   have "Header turns white when scrolling" ticked in /admin). */
(function () {
  var header = document.querySelector(".site-nav--turns");
  if (!header) return;
  function update() {
    header.classList.toggle("is-scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", update, { passive: true });
  update();
})();


/* The phone menu: the burger button opens and closes it. */
(function () {
  var header = document.querySelector(".site-nav");
  var burger = document.querySelector("[data-burger]");
  if (!header || !burger) return;
  function setOpen(open) {
    header.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  }
  burger.addEventListener("click", function (e) {
    e.stopPropagation();
    setOpen(!header.classList.contains("is-open"));
  });
  document.addEventListener("click", function (e) {
    if (header.classList.contains("is-open") && !header.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });
  window.addEventListener("resize", function () {
    if (window.innerWidth > 700) setOpen(false);
  });
})();


/* On a phone the logo leads to the endless gallery (the phone homepage). */
(function () {
  var brand = document.querySelector("[data-mobile-home]");
  if (!brand) return;
  var phone = window.matchMedia("(max-width: 700px), (hover: none) and (pointer: coarse) and (max-width: 950px)");
  function apply() {
    if (!brand.dataset.desktopHref) brand.dataset.desktopHref = brand.getAttribute("href");
    brand.setAttribute("href", phone.matches ? brand.dataset.mobileHome : brand.dataset.desktopHref);
  }
  apply();
  if (phone.addEventListener) phone.addEventListener("change", apply);
})();
