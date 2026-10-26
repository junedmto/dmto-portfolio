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

document.querySelectorAll("[data-lanyard]").forEach((el) => {
  const d = el.dataset;
  render(
    <Lanyard
      frontImage={d.front || undefined}
      backImage={d.back || undefined}
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
