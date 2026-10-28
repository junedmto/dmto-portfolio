// The Contact playground: letters and your contact details fall into the
// window as physical objects you can grab, throw and pile up.
//
//   - Drag anything to throw it. Click an empty spot to add another shape.
//   - Click the email / phone / Instagram pills to use them.
//
// All settings come from data-* attributes on the [data-playground] element
// in src/_includes/layouts/playground.njk. This file is only needed to REBUILD
// the bundle:  npm run build:playground
// The finished result is src/assets/js/playground.bundle.js.
import Matter from "matter-js";

const { Engine, Bodies, Body, Composite, Mouse, MouseConstraint, Events, Query } = Matter;

const stage = document.querySelector("[data-playground]");
const canvas = stage && stage.querySelector("canvas");
if (stage && canvas && canvas.getContext) start();

function start() {
  document.documentElement.classList.add("cp-js");
  const ctx = canvas.getContext("2d");
  const d = stage.dataset;
  const INK = "#121212";
  const PAPER = "#ffffff";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  // "reveal" mode: the playground sits behind the page at the bottom of every
  // page and only runs while it is being uncovered.
  const reveal = d.mode === "reveal";
  const spacer = reveal ? document.querySelector("[data-reveal-spacer]") : null;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let unit = 56; // size of one letter tile, in pixels
  let edge = 6; // thickness of the box outlines, in pixels

  const engine = Engine.create({ gravity: { x: 0, y: 1.15 }, positionIterations: 8, velocityIterations: 6 });
  const world = engine.world;

  /* ---- Walls: floor and two sides, open at the top so things can fall in ---- */
  const pills = [];
  let walls = [];
  const buildWalls = () => {
    Composite.remove(world, walls);
    const t = 400;
    const opts = { isStatic: true, friction: 0.6, restitution: 0.2 };
    walls = [
      Bodies.rectangle(W / 2, H + t / 2, W + t * 2, t, opts),
      Bodies.rectangle(-t / 2, -H, t, H * 4, opts),
      Bodies.rectangle(W + t / 2, -H, t, H * 4, opts),
    ];
    Composite.add(world, walls);
  };

  const resize = () => {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // Sized so everything together fills roughly the bottom half of the window,
    // but never so big that the longest pill is wider than the window.
    unit = Math.max(38, Math.min(150, 0.086 * Math.sqrt(W * H)));
    const longest = Math.max(1, ...pills.map((p) => p.label.length));
    unit = Math.min(unit, (W * 0.92) / (longest * 0.6 * 0.75 + 1.1));
    edge = unit * 0.11;
    mouse.pixelRatio = dpr;
    buildWalls();
    // Anything now outside the window is moved back in.
    Composite.allBodies(world).forEach((b) => {
      if (b.isStatic) return;
      const x = Math.min(Math.max(b.position.x, 30), W - 30);
      if (x !== b.position.x) Body.setPosition(b, { x, y: b.position.y });
      if (b.position.y > H) Body.setPosition(b, { x: b.position.x, y: H - 40 });
    });
  };

  /* ---- Mouse and touch: Matter's mouse constraint does the dragging ---- */
  const mouse = Mouse.create(canvas);
  // Let the page keep its normal wheel behaviour.
  canvas.removeEventListener("mousewheel", mouse.mousewheel);
  canvas.removeEventListener("DOMMouseScroll", mouse.mousewheel);
  const drag = MouseConstraint.create(engine, {
    mouse,
    constraint: { stiffness: 0.25, damping: 0.14, render: { visible: false } },
  });
  Composite.add(world, drag);

  /* ---- Making things ---- */
  // Your own pixel typeface (src/assets/fonts/DMTOPixel.woff2). It is all capitals
  // and has no bold, so it is always drawn at normal weight.
  const fontFamily = '"DMTO Pixel", "Poppins", system-ui, sans-serif';
  const CAP = 0.7; // capital height as a fraction of the font size
  const body = (b, plugin) => {
    b.plugin = plugin;
    return b;
  };

  const tile = (letter, x, y, inverted) =>
    body(
      Bodies.rectangle(x, y, unit, unit, {
        restitution: 0.3,
        friction: 0.5,
        frictionAir: 0.012,
        angle: (Math.random() - 0.5) * 1.2,
      }),
      { kind: "tile", letter, inverted, w: unit, h: unit, edge }
    );

  const measure = (text, size) => {
    ctx.font = `400 ${size}px ${fontFamily}`;
    return ctx.measureText(text.toUpperCase()).width;
  };

  const pill = (label, x, y, action) => {
    const size = unit * 0.75;
    const w = measure(label, size) + unit * 1.1;
    const h = unit;
    return body(
      Bodies.rectangle(x, y, w, h, {
        restitution: 0.25,
        friction: 0.5,
        frictionAir: 0.01,
        angle: (Math.random() - 0.5) * 0.5,
      }),
      { kind: "pill", label, size, w, h, edge, action, hover: 0 }
    );
  };

  const shapeKinds = ["circle", "triangle", "square", "bar"];
  const shape = (x, y) => {
    const kind = shapeKinds[Math.floor(Math.random() * shapeKinds.length)];
    const s = unit * (0.5 + Math.random() * 0.5);
    const opts = { restitution: 0.35, friction: 0.45, frictionAir: 0.01, angle: Math.random() * 3 };
    let b;
    if (kind === "circle") b = Bodies.circle(x, y, s * 0.7, opts);
    else if (kind === "triangle") b = Bodies.polygon(x, y, 3, s * 0.85, opts);
    else if (kind === "bar") b = Bodies.rectangle(x, y, s * 2.1, s * 0.6, opts);
    else b = Bodies.rectangle(x, y, s * 1.3, s * 1.3, opts);
    return body(b, { kind: "shape", filled: Math.random() > 0.35 });
  };

  const extras = [];
  const addExtra = (x, y) => {
    const b = shape(x, y);
    extras.push(b);
    Composite.add(world, b);
    Body.setVelocity(b, { x: (Math.random() - 0.5) * 6, y: -4 - Math.random() * 4 });
    Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.3);
    // Keep the pile from growing forever.
    if (extras.length > 45) Composite.remove(world, extras.shift());
  };

  /* ---- Actions on the contact pills ---- */
  const toastEl = document.querySelector("[data-toast]");
  let toastTimer = 0;
  const toast = (text) => {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-on"), 2200);
  };
  const copy = (text, message) => {
    const done = () => toast(message);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => toast(text));
    else toast(text);
  };

  if (d.email) pills.push({ label: d.email, action: () => { copy(d.email, "Email copied"); window.location.href = `mailto:${d.email}`; } });
  if (d.phone) pills.push({ label: d.phone, action: () => { if (touch) window.location.href = `tel:${d.phone.replace(/[^+\d]/g, "")}`; else copy(d.phone, "Number copied"); } });
  if (d.instagram) pills.push({ label: d.handle || "Instagram", action: () => window.open(d.instagram, "_blank", "noopener") });

  /* ---- The opening drop ---- */
  // Where things start falling. On the Contact page that is above the window;
  // under a page it is the edge of the page, so things tumble out from under it.
  const spawnY = () => {
    if (!reveal || !spacer) return 0;
    const top = spacer.getBoundingClientRect().top - stage.getBoundingClientRect().top;
    return Math.min(Math.max(top, 0), H * 0.6);
  };
  const dropIn = () => {
    const words = (d.words || "HELLO HOLA OLÁ CIAO HALLO BONJOUR").split(/\s+/);
    let delay = 0;
    const step = reduceMotion ? 0 : 75;
    words.forEach((word, wi) => {
      [...word].forEach((letter) => {
        setTimeout(() => {
          const b = tile(letter, unit + Math.random() * (W - unit * 2), spawnY() - unit - Math.random() * unit * 2, wi % 2 === 1);
          Composite.add(world, b);
        }, delay);
        delay += step;
      });
    });
    pills.forEach((p, i) => {
      setTimeout(() => {
        const b = pill(p.label, W * (0.25 + 0.25 * i) + (Math.random() - 0.5) * unit, spawnY() - unit * 2, p.action);
        Composite.add(world, b);
      }, delay + i * 350 + 400);
    });
  };

  /* ---- Click vs drag ---- */
  let down = null;
  let emptyDown = null;
  const dynamic = () => Composite.allBodies(world).filter((b) => !b.isStatic);

  Events.on(drag, "mousedown", (e) => {
    const hit = Query.point(dynamic(), e.mouse.position);
    down = hit.length ? { body: hit[hit.length - 1], x: e.mouse.position.x, y: e.mouse.position.y, t: performance.now() } : null;
    emptyDown = hit.length ? null : { x: e.mouse.position.x, y: e.mouse.position.y, t: performance.now() };
    hideHint();
  });
  Events.on(drag, "mouseup", (e) => {
    const now = performance.now();
    const p = e.mouse.position;
    if (down && down.body.plugin && down.body.plugin.action) {
      if (Math.hypot(p.x - down.x, p.y - down.y) < 10 && now - down.t < 450) down.body.plugin.action();
    }
    if (emptyDown && Math.hypot(p.x - emptyDown.x, p.y - emptyDown.y) < 10 && now - emptyDown.t < 450) addExtra(p.x, p.y);
    down = null;
    emptyDown = null;
  });

  // Fast throws must not tunnel through the walls.
  Events.on(engine, "beforeUpdate", () => {
    dynamic().forEach((b) => {
      const v = b.velocity;
      const s = Math.hypot(v.x, v.y);
      if (s > 42) Body.setVelocity(b, { x: (v.x / s) * 42, y: (v.y / s) * 42 });
    });
  });

  /* ---- Drawing ---- */
  const drawBody = (b) => {
    const p = b.plugin;
    if (!p) return;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    // A square box with a thick outline, like the logo. The outline is drawn
    // inside the physics box so objects touch exactly where they look like they do.
    const box = (w, h, e, fill, line) => {
      ctx.fillStyle = line;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = fill;
      ctx.fillRect(-w / 2 + e, -h / 2 + e, w - e * 2, h - e * 2);
    };
    if (p.kind === "tile") {
      box(p.w, p.h, p.edge, p.inverted ? INK : PAPER, INK);
      ctx.fillStyle = p.inverted ? PAPER : INK;
      // Letters with an accent are drawn smaller so the accent stays inside the box.
      const size = p.w * (p.letter.charCodeAt(0) > 127 ? 0.62 : 0.88);
      ctx.font = `400 ${size}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      // The baseline sits half a capital below the middle; the font keeps one
      // pixel of space after each letter, so nudge back by half of it.
      ctx.fillText(p.letter, -size * 0.05, (size * CAP) / 2);
    } else if (p.kind === "pill") {
      const grow = 1 + p.hover * 0.04;
      ctx.scale(grow, grow);
      const on = p.hover > 0.5;
      box(p.w, p.h, p.edge, on ? INK : PAPER, INK);
      ctx.fillStyle = on ? PAPER : INK;
      ctx.font = `400 ${p.size}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(p.label.toUpperCase(), -p.size * 0.05, (p.size * CAP) / 2);
    } else {
      // A loose shape: outline the physics body itself.
      ctx.rotate(-b.angle);
      ctx.translate(-b.position.x, -b.position.y);
      const parts = b.parts.length > 1 ? b.parts.slice(1) : [b];
      parts.forEach((part) => {
        ctx.beginPath();
        part.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
        ctx.closePath();
        ctx.lineJoin = "miter";
        if (p.filled) {
          ctx.fillStyle = INK;
          ctx.fill();
        }
        ctx.lineWidth = edge;
        ctx.strokeStyle = INK;
        ctx.stroke();
      });
    }
    ctx.restore();
  };

  let last = performance.now();
  let looping = false;
  const frame = (now) => {
    if (!looping) return;
    const dt = Math.min(now - last, 33);
    last = now;
    Engine.update(engine, dt);

    // Pills grow a little and invert when the pointer is over them.
    const bodies = dynamic();
    const over = mouse.position && Query.point(bodies, mouse.position);
    let cursor = "default";
    bodies.forEach((b) => {
      const p = b.plugin;
      if (p && p.kind === "pill") p.hover += (((over && over.includes(b)) ? 1 : 0) - p.hover) * 0.25;
    });
    if (over && over.length) cursor = over.some((b) => b.plugin && b.plugin.action) ? "pointer" : "grab";
    if (drag.body) cursor = "grabbing";
    canvas.style.cursor = cursor;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // Pills are drawn last so they always stay on top of the letters.
    bodies.filter((b) => !(b.plugin && b.plugin.kind === "pill")).forEach(drawBody);
    bodies.filter((b) => b.plugin && b.plugin.kind === "pill").forEach(drawBody);
    requestAnimationFrame(frame);
  };

  /* ---- Hint ---- */
  const hintEl = document.querySelector("[data-hint]");
  const hideHint = () => hintEl && hintEl.classList.add("is-off");
  if (!reveal) setTimeout(hideHint, 9000);

  const startLoop = () => {
    if (looping) return;
    looping = true;
    last = performance.now();
    requestAnimationFrame(frame);
  };

  /* ---- Under a page: only run while uncovered, and drop on arrival ---- */
  let dropped = false;
  const watch = () => {
    const onChange = (entries) => {
      const e = entries[entries.length - 1];
      if (!e.isIntersecting) {
        looping = false; // nothing to see: stop the physics until it is back
        return;
      }
      startLoop();
      if (!dropped && e.intersectionRatio >= 0.3) {
        dropped = true;
        dropIn();
        setTimeout(hideHint, 9000);
      }
    };
    new IntersectionObserver(onChange, { threshold: [0, 0.3] }).observe(spacer);

    // Keep a drag going when the pointer leaves the playground over the page.
    window.addEventListener("mousemove", (e) => {
      if (drag.body && e.target !== canvas) mouse.mousemove(e);
    });
    window.addEventListener("mouseup", (e) => {
      if (drag.body && e.target !== canvas) mouse.mouseup(e);
    });

    // Touch: a swipe that starts on an object moves it; any other swipe
    // scrolls the page as usual. A quick tap on empty space adds a shape.
    let ignoring = false;
    let tap = null;
    const local = (t) => {
      const r = canvas.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    canvas.addEventListener(
      "touchstart",
      (e) => {
        const p = local(e.touches[0]);
        if (Query.point(dynamic(), p).length) {
          ignoring = false;
          e.preventDefault(); // stops the page scrolling for this swipe
        } else {
          ignoring = true;
          tap = { x: p.x, y: p.y, t: performance.now() };
          e.stopImmediatePropagation();
        }
      },
      { capture: true, passive: false }
    );
    ["touchmove", "touchend", "touchcancel"].forEach((type) =>
      canvas.addEventListener(
        type,
        (e) => {
          if (!ignoring) return;
          e.stopImmediatePropagation();
          if (type === "touchend") {
            const p = local(e.changedTouches[0]);
            if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) < 10 && performance.now() - tap.t < 450) addExtra(p.x, p.y);
            ignoring = false;
            tap = null;
          }
          if (type === "touchcancel") {
            ignoring = false;
            tap = null;
          }
        },
        { capture: true, passive: false }
      )
    );
  };

  /* ---- Go ---- */
  window.addEventListener("resize", resize);
  const ready = document.fonts && document.fonts.load ? Promise.race([document.fonts.load(`400 40px "DMTO Pixel"`), new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
  ready.finally(() => {
    resize();
    if (reveal && spacer && "IntersectionObserver" in window) {
      watch();
    } else {
      dropIn();
      startLoop();
    }
  });
}
