// Mounts a Lanyard into every element marked with [data-lanyard] on the page.
// All settings come from data-* attributes on that element, so the page
// template (src/_includes/layouts/lanyard.njk) controls them, not this file.
//
// This file is only needed if you want to REBUILD the bundle:
//   npm run build:lanyard
// The finished result is src/assets/js/lanyard.bundle.js, which is what the
// site actually loads.
import { render } from "preact";
import Lanyard from "./Lanyard.jsx";

const num = (v, fallback) => (v === undefined || v === "" || isNaN(Number(v)) ? fallback : Number(v));
const bool = (v, fallback) => (v === undefined ? fallback : v !== "false");

// An SVG that only has a viewBox (no width/height) has no size of its own, so
// the browser can't tell how to fit it onto the card. This adds a size to it
// before it is used, and makes it big enough to stay sharp.
const sizedSvg = async (url) => {
  try {
    const text = await (await fetch(url)).text();
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const svg = doc.documentElement;
    if (svg.nodeName.toLowerCase() !== "svg") return url;
    let w = parseFloat(svg.getAttribute("width"));
    let h = parseFloat(svg.getAttribute("height"));
    const vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", vb.join(" "));
      if (!(w > 0 && h > 0)) {
        w = vb[2];
        h = vb[3];
      }
    } else if (w > 0 && h > 0) {
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    } else {
      w = 1024;
      h = 1440;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    const scale = 2048 / w;
    svg.setAttribute("width", String(Math.round(w * scale)));
    svg.setAttribute("height", String(Math.round(h * scale)));
    const xml = new XMLSerializer().serializeToString(svg);
    return URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
  } catch (error) {
    return url;
  }
};

document.querySelectorAll("[data-lanyard]").forEach(async (el) => {
  const d = el.dataset;
  const prepare = async (url) => (url && /\.svg(\?|$)/i.test(url) ? sizedSvg(url) : url);
  const back = await prepare(d.back);
  const front = await prepare(d.front);
  render(
    <Lanyard
      frontImage={front || undefined}
      backImage={back || undefined}
      backFit={d.backFit || undefined}
      backColor={d.backColor || undefined}
      strapImage={d.strap || undefined}
      imageFit={d.fit || "cover"}
      cardColor={d.cardColor || "#ffffff"}
      strapColor={d.strapColor || "#111111"}
      orientation={d.orientation || "portrait"}
      finish={d.finish || "glossy"}
      metal={d.metal || "silver"}
      size={num(d.size, 0.6)}
      strapLength={num(d.strapLength, 0.5)}
      strapWidth={num(d.strapWidth, 0.65)}
      cornerRadius={num(d.cornerRadius, 0.3)}
      gravity={num(d.gravity, 1)}
      damping={num(d.damping, 0.5)}
      elasticity={num(d.elasticity, 0.5)}
      breeze={num(d.breeze, 0.5)}
      interactive={bool(d.interactive, true)}
      intro={bool(d.intro, true)}
    />,
    el
  );
});
