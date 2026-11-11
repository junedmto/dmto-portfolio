// loader.js
// Runs the loading screen (markup: the [data-loader] block in layouts/base.njk,
// styles: assets/css/loader.css). The little script in the page head decides
// whether it plays at all (first page of a visit only); this file does the
// counting and the lift.
//
//   DURATION  how long the "loading" lasts, in milliseconds
//   MAX_WAIT  the longest it will wait for the page to finish loading, after
//             the count reaches 100
(function () {
  var DURATION = 1100;
  var MAX_WAIT = 2500;
  var LIFT_TIME = 1400; // a little longer than the lift in loader.css

  var root = document.documentElement;
  var loader = document.querySelector("[data-loader]");
  if (!loader || !root.classList.contains("is-loading")) return;

  var bar = loader.querySelector("[data-loader-bar]");
  var count = loader.querySelector("[data-loader-count]");
  var started = performance.now();
  var leaving = false;

  function ease(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function show(progress) {
    var n = Math.round(progress * 100);
    if (count) count.textContent = ("00" + n).slice(-3);
    if (bar) bar.style.transform = "scaleX(" + progress + ")";
  }

  function done() {
    root.classList.remove("is-loading");
    try {
      sessionStorage.setItem("dmto-loaded", "1");
    } catch (e) {}
  }

  function leave() {
    if (leaving) return;
    leaving = true;
    show(1);
    loader.classList.add("is-leaving");
    setTimeout(done, LIFT_TIME);
  }

  function tick(now) {
    if (leaving) return;
    var t = Math.min(1, (now - started) / DURATION);
    show(ease(t));
    if (t < 1) {
      requestAnimationFrame(tick);
      return;
    }
    // Count finished: wait for the page itself too (but not for long).
    if (document.readyState === "complete") leave();
    else {
      window.addEventListener("load", leave, { once: true });
      setTimeout(leave, MAX_WAIT);
    }
  }

  // A click or key press skips it.
  loader.addEventListener("click", leave);
  window.addEventListener("keydown", leave, { once: true });

  show(0);
  requestAnimationFrame(tick);
})();
