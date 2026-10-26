// Everything the lanyard About page does in the browser:
//   1. the hanging card              ([data-lanyard])
//   2. the skills wheel              ([data-wheel]), turned by scrolling the page
//   3. the bio revealing word by word as you scroll   ([data-reveal])
//   4. the Education / Publications blocks fading in  (.lany__block)
//
// All settings come from data-* attributes in src/_includes/layouts/lanyard.njk.
// This file is only needed if you want to REBUILD the bundle:
//   npm run build:lanyard
// The finished result is src/assets/js/lanyard.bundle.js, which the site loads.
import { render } from "preact";
import Lanyard from "./Lanyard.jsx";
import OptionWheel from "./OptionWheel.jsx";

const root = document.documentElement;
root.classList.add("lany-js");

const num = (v, fallback) => (v === undefined || v === "" || isNaN(Number(v)) ? fallback : Number(v));
const bool = (v, fallback) => (v === undefined ? fallback : v !== "false");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* 1. The card ---------------------------------------------------------- */
document.querySelectorAll("[data-lanyard]").forEach((el) => {
  const d = el.dataset;
  render(
    <Lanyard
      frontImage={d.front || undefined}
      backImage={d.back || undefined}
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

/* 2. The skills wheel -------------------------------------------------- */
// On a wide screen the plain skills list is swapped for a wheel that turns as
// you scroll the page. On a phone the plain list stays.
const wheelEl = document.querySelector("[data-wheel]");
const lany = document.querySelector(".lany");
const wide = window.matchMedia("(min-width: 901px)");
let wheelCount = 0;
let wheelMounted = false;

const syncWheel = () => {
  if (!wheelEl || !lany) return;
  if (wide.matches && !wheelMounted) {
    const d = wheelEl.dataset;
    const items = [...document.querySelectorAll(".lany__skills-list li")].map((li) => li.textContent.trim());
    if (!items.length) return;
    wheelCount = items.length;
    render(
      <OptionWheel
        items={items}
        defaultSelected={0}
        side={d.side || "right"}
        fontSize={num(d.fontSize, 2)}
        spacing={num(d.spacing, 1.4)}
        inset={num(d.inset, 40)}
        curve={num(d.curve, 0.5)}
        tilt={num(d.tilt, 6)}
        fade={num(d.fade, 0.28)}
        blur={num(d.blur, 2.25)}
        loop={bool(d.loop, true)}
        draggable={false}
        captureWheel={false}
        activeColor={d.activeColor || "#000000"}
        textColor={d.textColor || "#515151"}
      />,
      wheelEl
    );
    lany.classList.add("lany--wheel");
    wheelMounted = true;
    update();
  } else if (!wide.matches && wheelMounted) {
    render(null, wheelEl);
    lany.classList.remove("lany--wheel");
    wheelMounted = false;
  }
};

/* 3. The bio, revealed word by word ------------------------------------ */
const words = [];
document.querySelectorAll("[data-reveal]").forEach((block) => {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const frag = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        frag.append(part);
      } else {
        const span = document.createElement("span");
        span.className = "rv-word";
        span.textContent = part;
        frag.append(span);
        words.push(span);
      }
    });
    node.replaceWith(frag);
  });
});

// Each word fades and sharpens as it rises from the bottom of the window.
const updateWords = () => {
  const vh = window.innerHeight;
  const rects = words.map((w) => w.getBoundingClientRect());
  words.forEach((w, i) => {
    const centre = rects[i].top + rects[i].height / 2;
    const p = reduceMotion ? 1 : clamp((vh * 0.9 - centre) / (vh * 0.42), 0, 1);
    w.style.opacity = (0.12 + 0.88 * p).toFixed(3);
    w.style.filter = p < 1 ? `blur(${((1 - p) * 5).toFixed(2)}px)` : "";
  });
};

/* 4. Blocks that fade in ----------------------------------------------- */
const blocks = document.querySelectorAll(".lany__block");
if ("IntersectionObserver" in window) {
  const seen = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          seen.unobserve(e.target);
        }
      }),
    { threshold: 0.2 }
  );
  blocks.forEach((b) => seen.observe(b));
} else {
  blocks.forEach((b) => b.classList.add("is-in"));
}

/* Scrolling drives the word reveal and turns the wheel ------------------ */
function update() {
  updateWords();
  if (wheelMounted && wheelCount > 1) {
    const room = document.documentElement.scrollHeight - window.innerHeight;
    const progress = room > 0 ? clamp(window.scrollY / room, 0, 1) : 0;
    const wheel = wheelEl.querySelector(".option-wheel");
    wheel?.dispatchEvent(new CustomEvent("optionwheel:set", { detail: Math.round(progress * (wheelCount - 1)) }));
  }
}

let queued = false;
const schedule = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    update();
  });
};
window.addEventListener("scroll", schedule, { passive: true });
window.addEventListener("resize", schedule);
wide.addEventListener?.("change", syncWheel);
syncWheel();
update();
