// loader.js
// Runs the loading screen and the page transitions (markup: the [data-loader]
// block in layouts/base.njk, styles: assets/css/loader.css).
//
// 1. First page of a visit: the little script in the page head turns the
//    loading screen on; this file does the counting and the lift.
// 2. Moving between pages: a click on a link to another page of the site
//    makes the black and grey curtain rise over the page, then goes to the
//    link. The new page starts covered and lifts the curtain away.
//
//   DURATION    how long the "loading" count lasts, in milliseconds
//   MAX_WAIT    the longest it will wait for the page to finish loading
//   COVER_TIME  how long the curtain takes to rise over the page when you click
//               a link (a little longer than --loader-cover in loader.css)
//   LIFT_TIME   how long to keep the curtain in place while it lifts (a little
//               longer than --loader-lift / --loader-lift-fast in loader.css)
(function () {
  var DURATION = 1400;
  var MAX_WAIT = 2500;
  var LIFT_TIME = 1700; // a little longer than the lift in loader.css (first visit)
  var LIFT_TIME_FAST = 800; // the same, for the lift after clicking a link
  var COVER_TIME = 560; // curtain rise (0.4s) plus its 0.07s delay, and a hair more

  var root = document.documentElement;
  var loader = document.querySelector("[data-loader]");
  if (!loader) return;

  /* ---- Leaving this page: curtain rises, then go to the link ---- */

  function pageLike(url) {
    var last = url.pathname.split("/").pop();
    return last === "" || last.indexOf(".") === -1 || /\.html?$/.test(last);
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    var url;
    try {
      url = new URL(a.href, location.href);
    } catch (err) {
      return;
    }
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
    if (!pageLike(url)) return;
    if (url.pathname === location.pathname && url.search === location.search) return; // same page / #anchor
    if (reduced()) return;

    e.preventDefault();
    try {
      sessionStorage.setItem("dmto-nav", "1");
    } catch (err) {}
    root.classList.add("is-covering");
    void loader.offsetWidth; // let the browser register the hidden start
    loader.classList.add("is-in");
    setTimeout(function () {
      location.href = url.href;
    }, COVER_TIME);
  });

  function reduced() {
    return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // Back button restoring this page from memory: take the curtain away.
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) {
      root.classList.remove("is-covering", "is-loading", "is-transition");
      loader.classList.remove("is-in", "is-leaving");
    }
  });

  /* ---- Arriving: first-visit screen, or the curtain lifting ---- */

  if (!root.classList.contains("is-loading")) return;

  var transition = root.classList.contains("is-transition");
  var count = loader.querySelector("[data-loader-count]");
  var started = performance.now();
  var leaving = false;

  function ease(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function show(progress) {
    if (count) count.textContent = ("00" + Math.round(progress * 100)).slice(-3);
  }

  function done() {
    root.classList.remove("is-loading", "is-transition");
    try {
      sessionStorage.setItem("dmto-loaded", "1");
    } catch (e) {}
  }

  function leave() {
    if (leaving) return;
    leaving = true;
    show(1);
    loader.classList.add("is-leaving");
    setTimeout(done, transition ? LIFT_TIME_FAST : LIFT_TIME);
  }

  // Arriving from another page: lift as soon as the page is ready.
  if (transition) {
    if (document.readyState === "complete") setTimeout(leave, 60);
    else {
      window.addEventListener("load", function () {
        setTimeout(leave, 60);
      }, { once: true });
      setTimeout(leave, 1500);
    }
    return;
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

  // A click or key press skips the first-visit screen.
  loader.addEventListener("click", leave);
  window.addEventListener("keydown", leave, { once: true });

  show(0);
  requestAnimationFrame(tick);
})();
