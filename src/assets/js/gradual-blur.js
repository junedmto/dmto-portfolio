// gradual-blur.js
// Builds the soft blur along the bottom of the screen (styles:
// assets/css/gradual-blur.css). Based on the "Gradual Blur" component from
// reactbits.dev, with its "subtle" preset.
//
//   STRENGTH   how strong the blur gets at the very bottom (1 = subtle,
//              2 = stronger, 0 = none)
//   LAYERS     how many blur layers are stacked: more is smoother
//   TINT       how much of the page colour is washed over the bottom edge
//              (0 = none, 0.3 = a little, 1 = solid)
//   HOVER      how much stronger the blur gets while the pointer is over it
//              (1 = no change, 1.2 = a little, 0 = it clears)
//   The height of the blur is set in gradual-blur.css (height: 4rem).
//   It fades out by itself near the end of a page, so it never gets in the
//   way of the playground at the bottom.
(function () {
  var STRENGTH = 1;
  var LAYERS = 8;
  var TINT = 0.3;
  var HOVER = 1.2;

  var root = document.querySelector("[data-gradual-blur]");
  if (!root) return;
  var doc = document.documentElement;

  function clamp01(v) {
    return Math.min(Math.max(v, 0), 1);
  }

  /* ---- The stack of blur layers: each blurs a little more than the last,
          and a mask fades each one in over its own slice of the strip ---- */
  var maxBlur = Math.max(STRENGTH, 0) * 12;
  function level(u) {
    return maxBlur * ((Math.pow(2, 4 * clamp01(u)) - 1) / 15);
  }

  for (var i = 0; i < LAYERS; i++) {
    var from = level(i / LAYERS);
    var to = level((i + 1) / LAYERS);
    var radius = Math.sqrt(Math.max(to * to - from * from, 0)).toFixed(3);
    var filter = "blur(calc(" + radius + "px * var(--gradual-blur-reveal, 1) * var(--gradual-blur-hover, 1)))";
    var mask =
      "linear-gradient(to bottom, transparent " + ((i / LAYERS) * 100).toFixed(2) + "%, #000 " + (((i + 1) / LAYERS) * 100).toFixed(2) + "%)";
    var layer = document.createElement("div");
    layer.style.backdropFilter = filter;
    layer.style.webkitBackdropFilter = filter;
    layer.style.maskImage = mask;
    layer.style.webkitMaskImage = mask;
    root.appendChild(layer);
  }

  if (TINT > 0) {
    var stops = [];
    for (var k = 0; k <= 8; k++) {
      var t = k / 8;
      var alpha = t * t * t * (t * (t * 6 - 15) + 10);
      stops.push("rgba(0, 0, 0, " + alpha.toFixed(3) + ") " + (t * 100).toFixed(1) + "%");
    }
    var tintMask = "linear-gradient(to bottom, " + stops.join(", ") + ")";
    var wash = document.createElement("div");
    wash.style.background = "rgba(255, 255, 255, " + TINT + ")";
    wash.style.background = "color-mix(in srgb, var(--color-paper, #fff) " + TINT * 100 + "%, transparent)";
    wash.style.maskImage = tintMask;
    wash.style.webkitMaskImage = tintMask;
    wash.style.opacity = "calc(var(--gradual-blur-reveal, 1) * min(var(--gradual-blur-hover, 1), 1))";
    root.appendChild(wash);
  }

  /* ---- Fade out near the end of the page ---- */
  var spacer = document.querySelector("[data-reveal-spacer]");
  function update() {
    var reach = Math.max(root.getBoundingClientRect().height, 1);
    var room;
    if (spacer) {
      // Pages with the playground at the end: stop before it comes into view.
      room = spacer.getBoundingClientRect().top - window.innerHeight;
    } else {
      room = doc.scrollHeight - window.innerHeight - window.scrollY;
    }
    root.style.setProperty("--gradual-blur-reveal", clamp01(room / reach).toFixed(3));
  }
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  window.addEventListener("load", update);

  /* ---- A little stronger while the pointer is over it ---- */
  if (HOVER !== 1) {
    var inside = false;
    window.addEventListener(
      "pointermove",
      function (e) {
        var box = root.getBoundingClientRect();
        var now = e.clientY >= box.top && e.clientY <= box.bottom;
        if (now === inside) return;
        inside = now;
        root.style.setProperty("--gradual-blur-hover", inside ? String(Math.max(HOVER, 0)) : "1");
      },
      { passive: true }
    );
    doc.addEventListener("pointerleave", function () {
      inside = false;
      root.style.setProperty("--gradual-blur-hover", "1");
    });
  }
})();
