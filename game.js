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
  jelly = { x: W / 2, y: H * 0.7, r: 18, pulse: 0 };
  plankton = Array.from({ length: 5 }, spawnPlankton);
  turtles = [];
  bubbles = Array.from({ length: 30 }, () => ({
    x: rand(0, W),
    y: rand(0, H),
    r: rand(1, 3),
    speed: rand(10, 30),
  }));
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
  lastTime = performance.now();
  requestAnimationFrame(loop);
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

function loop(now) {
  if (!running) return;
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  update(dt);
  draw(now / 1000);

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

  // La méduse suit la cible en douceur, comme si elle nageait
  jelly.pulse += dt * 4;
  const ease = 1 - Math.pow(0.02, dt);
  jelly.x += (pointer.x - jelly.x) * ease;
  jelly.y += (pointer.y - jelly.y) * ease + Math.sin(jelly.pulse) * 0.3;
  jelly.x = Math.max(jelly.r, Math.min(W - jelly.r, jelly.x));
  jelly.y = Math.max(jelly.r, Math.min(H - jelly.r, jelly.y));

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

  // Bulles de décor
  for (const b of bubbles) {
    b.y -= b.speed * dt;
    if (b.y < -5) {
      b.y = H + 5;
      b.x = rand(0, W);
    }
  }
}

// ---------- Dessin ----------
function draw(time) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0d2b5c");
  bg.addColorStop(1, "#030816");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(180, 230, 255, 0.25)";
  for (const b of bubbles) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of plankton) drawPlankton(p, time);
  for (const t of turtles) drawTurtle(t);
  drawJelly(jelly);
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

function drawJelly(j) {
  const squash = Math.sin(j.pulse) * 0.12;
  const rx = j.r * (1 + squash);
  const ry = j.r * (1 - squash);

  ctx.save();
  ctx.translate(j.x, j.y);

  // Tentacules ondulants
  ctx.strokeStyle = "rgba(255, 143, 216, 0.7)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = -2; i <= 2; i++) {
    const baseX = i * rx * 0.35;
    ctx.beginPath();
    ctx.moveTo(baseX, 0);
    for (let s = 1; s <= 6; s++) {
      const y = s * 5;
      const x = baseX + Math.sin(j.pulse * 1.5 + s * 0.8 + i) * 3;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Ombrelle
  ctx.shadowColor = "#ff8fd8";
  ctx.shadowBlur = 20;
  const body = ctx.createRadialGradient(0, -ry * 0.4, 2, 0, 0, rx);
  body.addColorStop(0, "rgba(255, 220, 245, 0.95)");
  body.addColorStop(1, "rgba(255, 120, 210, 0.75)");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, Math.PI, 0);
  ctx.quadraticCurveTo(0, ry * 0.35, -rx, 0);
  ctx.fill();

  // Yeux
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#3a0d33";
  ctx.beginPath();
  ctx.arc(-rx * 0.3, -ry * 0.35, 2, 0, Math.PI * 2);
  ctx.arc(rx * 0.3, -ry * 0.35, 2, 0, Math.PI * 2);
  ctx.fill();

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

// Premier rendu (écran d'accueil)
reset();
draw(0);
