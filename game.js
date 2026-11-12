"use strict";

// ---------- Configuration ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const playBtn = document.getElementById("play");

const BEST_KEY = "meduses-best";
const KEY_SPEED = 260; // px/s avec le clavier

// ---------- État ----------
let jelly;
let plankton;
let turtles;
let bubbles;
let score;
let best = readBest();
let running = false;
let lastTime = 0;
let elapsed = 0;
let turtleTimer = 0;

const pointer = { x: W / 2, y: H * 0.7, active: false };
const keys = new Set();

bestEl.textContent = best;

// ---------- Utilitaires ----------
const rand = (min, max) => Math.random() * (max - min) + min;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* stockage indisponible : pas grave */
  }
}

// ---------- Création des entités ----------
function spawnPlankton() {
  return {
    x: rand(20, W - 20),
    y: rand(60, H - 40),
    r: rand(4, 7),
    phase: rand(0, Math.PI * 2),
  };
}

function spawnTurtle() {
  const fromLeft = Math.random() < 0.5;
  const speed = rand(70, 120) + elapsed * 3; // ça accélère avec le temps
  return {
    x: fromLeft ? -40 : W + 40,
    y: rand(40, H - 40),
    vx: fromLeft ? speed : -speed,
    r: 22,
    phase: rand(0, Math.PI * 2),
  };
}

function reset() {
  jelly = createJelly(W / 2, H * 0.7);
  plankton = Array.from({ length: 5 }, spawnPlankton);
  turtles = [];
  score = 0;
  elapsed = 0;
  turtleTimer = 1.5;
  pointer.x = jelly.x;
  pointer.y = jelly.y;
  scoreEl.textContent = "0";
}

// ---------- Boucle de jeu ----------
function start() {
  reset();
  overlay.hidden = true;
  running = true;
}

function gameOver() {
  running = false;
  if (score > best) {
    best = score;
    saveBest(best);
    bestEl.textContent = best;
    overlayTitle.textContent = "Nouveau record !";
  } else {
    overlayTitle.textContent = "Croquée !";
  }
  overlayText.textContent = `Ta méduse a mangé ${score} plancton${score > 1 ? "s" : ""}.`;
  playBtn.textContent = "Rejouer";
  overlay.hidden = false;
  playBtn.focus();
}

// La boucle tourne en permanence pour que l'eau reste vivante sur l'écran
// d'accueil ; la logique de jeu ne tourne que pendant une partie.
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const time = now / 1000;

  updateWater(dt, time);
  if (running) update(dt);
  draw(time);

  requestAnimationFrame(loop);
}

function update(dt) {
  elapsed += dt;

  // Déplacement clavier : on pousse la cible
  let dx = 0;
  let dy = 0;
  if (keys.has("ArrowLeft")) dx -= 1;
  if (keys.has("ArrowRight")) dx += 1;
  if (keys.has("ArrowUp")) dy -= 1;
  if (keys.has("ArrowDown")) dy += 1;
  if (dx || dy) {
    pointer.x = jelly.x + dx * KEY_SPEED * dt * 6;
    pointer.y = jelly.y + dy * KEY_SPEED * dt * 6;
  }

  updateJelly(jelly, dt);

  // Plancton mangé ?
  for (let i = 0; i < plankton.length; i++) {
    if (dist(jelly, plankton[i]) < jelly.r + plankton[i].r) {
      plankton[i] = spawnPlankton();
      score++;
      scoreEl.textContent = score;
    }
  }

  // Tortues
  turtleTimer -= dt;
  if (turtleTimer <= 0) {
    turtles.push(spawnTurtle());
    turtleTimer = Math.max(0.5, 2 - elapsed * 0.03);
  }
  for (const t of turtles) {
    t.x += t.vx * dt;
    t.phase += dt * 6;
    if (dist(jelly, t) < jelly.r + t.r - 6) {
      gameOver();
      return;
    }
  }
  turtles = turtles.filter((t) => t.x > -60 && t.x < W + 60);
}

// ---------- Dessin ----------
function draw(time) {
  drawWater(time);
  for (const p of plankton) drawPlankton(p, time);
  for (const t of turtles) drawTurtle(t);
  drawJelly(jelly);
  drawVignette();
}

// ---------- Eau ----------
// Plusieurs couches légères qui bougent à des vitesses différentes :
// dégradé de profondeur, rayons de lumière, reflets de surface et neige marine.

const RAYS = Array.from({ length: 6 }, (_, i) => ({
  x: (i + 0.5) * (W / 6) + rand(-30, 30),
  width: rand(30, 70),
  spread: rand(60, 140),
  speed: rand(0.12, 0.25),
  phase: rand(0, Math.PI * 2),
  strength: rand(0.05, 0.1),
}));

const SNOW = Array.from({ length: 70 }, () => ({
  x: rand(0, W),
  y: rand(0, H),
  z: rand(0.25, 1), // profondeur : 1 = proche
  phase: rand(0, Math.PI * 2),
}));

// Le fond ne change pas : on le prépare une fois
const waterGradient = (() => {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#164a7a");
  g.addColorStop(0.35, "#0b2852");
  g.addColorStop(0.75, "#05132e");
  g.addColorStop(1, "#020714");
  return g;
})();

const vignette = (() => {
  const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.45, H * 0.8);
  g.addColorStop(0, "rgba(0, 0, 0, 0)");
  g.addColorStop(1, "rgba(0, 4, 14, 0.55)");
  return g;
})();

function updateWater(dt, time) {
  for (const s of SNOW) {
    // Chute lente + balancement porté par le courant
    s.y += (4 + s.z * 10) * dt;
    s.x += (Math.sin(time * 0.6 + s.phase) * 6 + 4) * s.z * dt;
    if (s.y > H + 4) {
      s.y = -4;
      s.x = rand(0, W);
    }
    if (s.x > W + 4) s.x = -4;
  }
}

function drawWater(time) {
  ctx.fillStyle = waterGradient;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Rayons de lumière qui ondulent depuis la surface
  for (const r of RAYS) {
    const sway = Math.sin(time * r.speed + r.phase) * 40;
    const pulse = 0.7 + Math.sin(time * r.speed * 2.3 + r.phase) * 0.3;
    const top = r.x + sway * 0.4;
    const bottom = r.x + sway + r.spread * 0.3;
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.85);
    g.addColorStop(0, `rgba(160, 215, 255, ${r.strength * pulse})`);
    g.addColorStop(1, "rgba(160, 215, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(top - r.width / 2, 0);
    ctx.lineTo(top + r.width / 2, 0);
    ctx.lineTo(bottom + r.spread, H * 0.85);
    ctx.lineTo(bottom - r.spread, H * 0.85);
    ctx.closePath();
    ctx.fill();
  }

  // Reflets mouvants près de la surface
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 7; k++) {
    const baseY = 8 + k * k * 3.2;
    ctx.strokeStyle = `rgba(190, 230, 255, ${0.13 * (1 - k / 7)})`;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y =
        baseY +
        Math.sin(x * 0.035 + time * (0.9 + k * 0.15) + k) * (2 + k * 0.6) +
        Math.sin(x * 0.012 - time * 0.45 + k * 2) * (3 + k);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Neige marine (particules en suspension)
  for (const s of SNOW) {
    const twinkle = 0.6 + Math.sin(time * 1.5 + s.phase) * 0.4;
    ctx.fillStyle = `rgba(200, 225, 255, ${0.08 + s.z * 0.22 * twinkle})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 0.5 + s.z * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawVignette() {
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

function drawPlankton(p, time) {
  const glow = 0.6 + Math.sin(time * 3 + p.phase) * 0.4;
  ctx.save();
  ctx.shadowColor = "#b8ff6b";
  ctx.shadowBlur = 12 * glow;
  ctx.fillStyle = `rgba(184, 255, 107, ${0.5 + glow * 0.5})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------- Méduse ----------
// Une ombrelle translucide qui pulse, et des filaments simulés comme des
// chaînes de points : chaque point suit le précédent, ce qui donne une
// traîne souple quand la méduse se déplace.

const TENTACLES = 9;
const TENTACLE_POINTS = 18;
const TENTACLE_SEG = 4.2;
const ARMS = 4;
const ARM_POINTS = 9;
const ARM_SEG = 3.6;

function makeChain(x, y, count, offset, length, seg, width) {
  return {
    offset, // position sur le bord de l'ombrelle, de -1 à 1
    seg,
    width,
    phase: rand(0, Math.PI * 2),
    points: Array.from({ length: count }, (_, i) => ({ x, y: y + i * seg })),
    length,
  };
}

function createJelly(x, y) {
  const tentacles = Array.from({ length: TENTACLES }, (_, i) =>
    makeChain(x, y, TENTACLE_POINTS, (i / (TENTACLES - 1)) * 2 - 1, 1, TENTACLE_SEG, 0.8)
  );
  const arms = Array.from({ length: ARMS }, (_, i) =>
    makeChain(x, y, ARM_POINTS, ((i / (ARMS - 1)) * 2 - 1) * 0.25, 1, ARM_SEG, 2.4)
  );
  const j = { x, y, r: 24, pulse: 0, contraction: 0, rx: 24, ry: 24, tentacles, arms };
  for (const chain of [...tentacles, ...arms]) {
    chain.points.forEach((p, i) => Object.assign(p, restPoint(j, chain, i)));
  }
  return j;
}

// Position de repos d'un point : les filaments s'ouvrent légèrement en éventail
function restPoint(j, chain, i) {
  return {
    x: j.x + chain.offset * j.rx * (0.85 + i * 0.05),
    y: j.y + j.ry * 0.08 + i * chain.seg,
  };
}

function bellSize(j) {
  // contraction : 0 = relâchée, 1 = poussée maximale
  return {
    rx: j.r * (1.05 - 0.18 * j.contraction),
    ry: j.r * (0.82 + 0.18 * j.contraction),
  };
}

function updateJelly(j, dt) {
  j.pulse += dt * 3.2;
  // Contraction brève puis relâchement lent, comme une vraie méduse
  const s = Math.max(0, Math.sin(j.pulse));
  j.contraction = s * s;

  // La méduse avance surtout pendant ses contractions
  const ease = 1 - Math.pow(0.04, dt * (0.4 + j.contraction * 1.6));
  j.x += (pointer.x - j.x) * ease;
  j.y += (pointer.y - j.y) * ease;
  j.x = Math.max(j.r, Math.min(W - j.r, j.x));
  j.y = Math.max(j.r, Math.min(H - j.r, j.y));

  const { rx, ry } = bellSize(j);
  j.rx = rx;
  j.ry = ry;
  const rimY = ry * 0.08;

  for (const chain of [...j.tentacles, ...j.arms]) {
    const pts = chain.points;
    pts[0].x = j.x + chain.offset * rx * 0.88;
    pts[0].y = j.y + rimY;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[i - 1];
      // Léger courant + ondulation, plus marquée vers l'extrémité
      const t = i / pts.length;
      const rest = restPoint(j, chain, i);
      const pull = Math.min(1, 1.2 * dt);
      p.x += (rest.x - p.x) * pull;
      p.y += (rest.y - p.y) * pull;
      p.x += Math.sin(elapsed * 1.6 + chain.phase + i * 0.45) * 14 * t * dt;
      // On garde une longueur de segment constante
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const d = Math.hypot(dx, dy) || 1;
      p.x = prev.x + (dx / d) * chain.seg;
      p.y = prev.y + (dy / d) * chain.seg;
    }
  }
}

function strokeChain(chain, rgb, alpha) {
  const pts = chain.points;
  ctx.lineCap = "butt"; // évite les points lumineux aux jointures
  for (let i = 1; i < pts.length; i++) {
    const t = i / pts.length;
    ctx.strokeStyle = `rgba(${rgb}, ${alpha * (1 - t)})`;
    ctx.lineWidth = chain.width * (1 - t * 0.6);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
}

function bellPath(rx, ry) {
  ctx.beginPath();
  ctx.moveTo(-rx, 0);
  ctx.bezierCurveTo(-rx, -ry * 1.35, rx, -ry * 1.35, rx, 0);
  // Bord festonné
  const lobes = 8;
  for (let i = 1; i <= lobes; i++) {
    const x0 = rx - ((i - 1) / lobes) * 2 * rx;
    const x1 = rx - (i / lobes) * 2 * rx;
    ctx.quadraticCurveTo((x0 + x1) / 2, ry * 0.16, x1, 0);
  }
  ctx.closePath();
}

function drawJelly(j) {
  const { rx, ry } = j;

  ctx.save();
  ctx.lineCap = "round";
  ctx.globalCompositeOperation = "lighter";

  // Halo bioluminescent
  const halo = ctx.createRadialGradient(j.x, j.y - ry * 0.3, 0, j.x, j.y - ry * 0.3, j.r * 3.2);
  halo.addColorStop(0, `rgba(140, 190, 255, ${0.16 + j.contraction * 0.08})`);
  halo.addColorStop(1, "rgba(140, 190, 255, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(j.x - j.r * 4, j.y - j.r * 4, j.r * 8, j.r * 8);

  // Filaments fins puis bras buccaux plus épais
  for (const t of j.tentacles) strokeChain(t, "190, 215, 255", 0.55);
  for (const a of j.arms) strokeChain(a, "225, 190, 240", 0.35);

  ctx.translate(j.x, j.y);

  // Ombrelle translucide
  const body = ctx.createLinearGradient(0, -ry, 0, ry * 0.2);
  body.addColorStop(0, "rgba(215, 232, 255, 0.42)");
  body.addColorStop(0.7, "rgba(170, 195, 255, 0.16)");
  body.addColorStop(1, "rgba(170, 195, 255, 0.06)");
  ctx.fillStyle = body;
  bellPath(rx, ry);
  ctx.fill();

  // Liseré lumineux
  ctx.strokeStyle = "rgba(225, 240, 255, 0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Bande interne plus claire, pour le volume
  ctx.strokeStyle = "rgba(225, 240, 255, 0.18)";
  ctx.beginPath();
  ctx.ellipse(0, -ry * 0.05, rx * 0.82, ry * 0.18, 0, Math.PI, 0);
  ctx.stroke();

  // Gonades en trèfle, comme une méduse lune
  ctx.strokeStyle = "rgba(240, 190, 230, 0.45)";
  ctx.lineWidth = 1.1;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.ellipse(
      Math.cos(a) * rx * 0.2,
      -ry * 0.45 + Math.sin(a) * ry * 0.13,
      rx * 0.13,
      ry * 0.09,
      a,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  ctx.restore();
}

function drawTurtle(t) {
  const dir = Math.sign(t.vx);
  const flap = Math.sin(t.phase) * 0.5;

  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.scale(dir, 1);

  // Nageoires
  ctx.fillStyle = "#4fa36b";
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(6, side * 12);
    ctx.rotate(side * (0.6 + flap));
    ctx.beginPath();
    ctx.ellipse(0, side * 8, 5, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Tête
  ctx.beginPath();
  ctx.arc(t.r + 4, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(t.r + 7, -3, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Carapace
  ctx.fillStyle = "#2f6b45";
  ctx.beginPath();
  ctx.ellipse(0, 0, t.r, t.r * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8fd18f";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, t.r * 0.5, t.r * 0.4, 0, 0, Math.PI * 2);
  ctx.moveTo(-t.r, 0);
  ctx.lineTo(-t.r * 0.5, 0);
  ctx.moveTo(t.r * 0.5, 0);
  ctx.lineTo(t.r, 0);
  ctx.stroke();

  ctx.restore();
}

// ---------- Entrées ----------
function setPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * W;
  pointer.y = ((event.clientY - rect.top) / rect.height) * H;
}

canvas.addEventListener("pointermove", setPointer);
canvas.addEventListener("pointerdown", setPointer);

window.addEventListener("keydown", (e) => {
  if (e.key.startsWith("Arrow")) {
    keys.add(e.key);
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key));

playBtn.addEventListener("click", start);

// Écran d'accueil
reset();
lastTime = performance.now();
requestAnimationFrame(loop);
