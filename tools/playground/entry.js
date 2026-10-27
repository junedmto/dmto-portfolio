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

  let W = 0;
  let H = 0;
  let dpr = 1;
  let unit = 56; // size of one letter tile, in pixels

  const engine = Engine.create({ gravity: { x: 0, y: 1.15 } });
  const world = engine.world;

  /* ---- Walls: floor and two sides, open at the top so things can fall in ---- */
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
    unit = Math.max(36, Math.min(84, Math.min(W, H) * 0.09));
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
    constraint: { stiffness: 0.18, damping: 0.12, render: { visible: false } },
  });
  Composite.add(world, drag);

  /* ---- Making things ---- */
  const fontFamily = '"Poppins", "Inter", system-ui, sans-serif';
  const body = (b, plugin) => {
    b.plugin = plugin;
    return b;
  };

  const tile = (letter, x, y, inverted) =>
    body(
      Bodies.rectangle(x, y, unit, unit, {
        chamfer: { radius: unit * 0.18 },
        restitution: 0.35,
        friction: 0.5,
        frictionAir: 0.012,
        angle: (Math.random() - 0.5) * 1.2,
      }),
      { kind: "tile", letter, inverted, w: unit, h: unit, r: unit * 0.18 }
    );

  const measure = (text, size) => {
    ctx.font = `700 ${size}px ${fontFamily}`;
    return ctx.measureText(text).width;
  };

  const pill = (label, x, y, action) => {
    const size = unit * 0.42;
    const w = measure(label, size) + unit * 1.1;
    const h = unit * 0.95;
    return body(
      Bodies.rectangle(x, y, w, h, {
        chamfer: { radius: h / 2 },
        restitution: 0.3,
        friction: 0.5,
        frictionAir: 0.01,
        angle: (Math.random() - 0.5) * 0.5,
      }),
      { kind: "pill", label, size, w, h, r: h / 2, action, hover: 0 }
    );
  };

  const shapeKinds = ["circle", "triangle", "square", "bar"];
  const shape = (x, y) => {
    const kind = shapeKinds[Math.floor(Math.random() * shapeKinds.length)];
    const s = unit * (0.45 + Math.random() * 0.45);
    const opts = { restitution: 0.45, friction: 0.4, frictionAir: 0.01, angle: Math.random() * 3 };
    let b;
    if (kind === "circle") b = Bodies.circle(x, y, s * 0.7, opts);
    else if (kind === "triangle") b = Bodies.polygon(x, y, 3, s * 0.85, opts);
    else if (kind === "bar") b = Bodies.rectangle(x, y, s * 2.1, s * 0.6, { ...opts, chamfer: { radius: s * 0.2 } });
    else b = Bodies.rectangle(x, y, s * 1.3, s * 1.3, { ...opts, chamfer: { radius: s * 0.15 } });
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

  const pills = [];
  if (d.email) pills.push({ label: d.email, action: () => { copy(d.email, "Email copied"); window.location.href = `mailto:${d.email}`; } });
  if (d.phone) pills.push({ label: d.phone, action: () => { if (touch) window.location.href = `tel:${d.phone.replace(/[^+\d]/g, "")}`; else copy(d.phone, "Number copied"); } });
  if (d.instagram) pills.push({ label: d.handle || "Instagram", action: () => window.open(d.instagram, "_blank", "noopener") });

  /* ---- The opening drop ---- */
  const dropIn = () => {
    const words = (d.words || "HELLO HOLA OLÁ CIAO HALLO BONJOUR").split(/\s+/);
    let delay = 0;
    const step = reduceMotion ? 0 : 75;
    words.forEach((word, wi) => {
      [...word].forEach((letter) => {
        setTimeout(() => {
          const b = tile(letter, unit + Math.random() * (W - unit * 2), -unit - Math.random() * unit * 2, wi % 2 === 1);
          Composite.add(world, b);
        }, delay);
        delay += step;
      });
    });
    pills.forEach((p, i) => {
      setTimeout(() => {
        const b = pill(p.label, W * (0.25 + 0.25 * i) + (Math.random() - 0.5) * unit, -unit * 2, p.action);
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
  const roundRect = (x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const drawBody = (b) => {
    const p = b.plugin;
    if (!p) return;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    if (p.kind === "tile") {
      roundRect(-p.w / 2, -p.h / 2, p.w, p.h, p.r);
      ctx.fillStyle = p.inverted ? PAPER : INK;
      ctx.fill();
      if (p.inverted) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      ctx.fillStyle = p.inverted ? INK : PAPER;
      ctx.font = `700 ${p.w * 0.58}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.letter, 0, p.h * 0.04);
    } else if (p.kind === "pill") {
      const grow = 1 + p.hover * 0.05;
      ctx.scale(grow, grow);
      roundRect(-p.w / 2, -p.h / 2, p.w, p.h, p.r);
      ctx.fillStyle = p.hover > 0.5 ? INK : PAPER;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = p.hover > 0.5 ? PAPER : INK;
      ctx.font = `700 ${p.size}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.label, 0, p.h * 0.03);
    } else {
      // A loose shape: outline the physics body itself.
      ctx.rotate(-b.angle);
      ctx.translate(-b.position.x, -b.position.y);
      const parts = b.parts.length > 1 ? b.parts.slice(1) : [b];
      parts.forEach((part) => {
        ctx.beginPath();
        part.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
        ctx.closePath();
        ctx.lineJoin = "round";
        if (p.filled) {
          ctx.fillStyle = INK;
          ctx.fill();
        }
        ctx.lineWidth = 3;
        ctx.strokeStyle = INK;
        ctx.stroke();
      });
    }
    ctx.restore();
  };

  let last = performance.now();
  const frame = (now) => {
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
  setTimeout(hideHint, 9000);

  /* ---- Go ---- */
  window.addEventListener("resize", resize);
  const ready = document.fonts && document.fonts.load ? Promise.race([document.fonts.load(`700 40px Poppins`), new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
  ready.finally(() => {
    resize();
    dropIn();
    last = performance.now();
    requestAnimationFrame(frame);
  });
}
