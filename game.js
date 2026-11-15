"use strict";

// ---------- Configuration ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Deux formats : portrait pour le mobile, panoramique pour le PC.
// Le monde a une taille logique fixe par format ; le canvas est rendu à la
// résolution réelle de l'écran pour rester net.
const MODES = {
  mobile: { W: 480, H: 640, plankton: 5, turtleSpeed: 1, turtleGap: 1 },
  desktop: { W: 1280, H: 720, plankton: 10, turtleSpeed: 1.5, turtleGap: 0.75 },
};
const desktopQuery = window.matchMedia("(min-width: 900px) and (min-aspect-ratio: 1/1)");
let mode = null;
let cfg = MODES.mobile;
let W = cfg.W;
let H = cfg.H;

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const playBtn = document.getElementById("play");
const fullscreenBtn = document.getElementById("fullscreen");

const BEST_KEY = "meduses-best";
const KEY_LEAD = 80; // avance de la cible au clavier (~250 px/s en moyenne)

// Déplacement : flèches + touches physiques WASD (= ZQSD sur un clavier AZERTY)
const MOVE = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
};

const INTRO = {
  mobile:
    "Guide ta méduse avec le doigt, la souris ou les flèches.<br />" +
    "Mange le plancton lumineux, évite les tortues.",
  desktop:
    "Guide ta méduse à la souris, avec <kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> " +
    "ou les flèches.<br />Mange le plancton lumineux, évite les tortues." +
    '<span class="keys"><kbd>Entrée</kbd> jouer · <kbd>Échap</kbd> pause · <kbd>F</kbd> plein écran</span>',
};

// ---------- Couleurs de la méduse ----------
// Chaque palier change la teinte de la méduse ; on passe de l'un à l'autre
// en douceur. Les couleurs sont des triplets RVB.
const TIERS = [
  {
    at: 0,
    name: "Bleu lune",
    pal: {
      halo: [140, 190, 255], tent: [190, 215, 255], arm: [225, 190, 240],
      top: [215, 232, 255], mid: [170, 195, 255], rim: [225, 240, 255], gonad: [240, 190, 230],
    },
  },
  {
    at: 10,
    name: "Lagon",
    pal: {
      halo: [100, 240, 215], tent: [165, 255, 235], arm: [190, 235, 255],
      top: [205, 255, 245], mid: [120, 225, 210], rim: [215, 255, 250], gonad: [255, 200, 230],
    },
  },
  {
    at: 25,
    name: "Rose aurore",
    pal: {
      halo: [255, 105, 165], tent: [255, 175, 210], arm: [255, 210, 175],
      top: [255, 200, 225], mid: [255, 115, 180], rim: [255, 225, 238], gonad: [255, 240, 170],
    },
  },
  {
    at: 50,
    name: "Abysse violet",
    pal: {
      halo: [150, 75, 255], tent: [195, 160, 255], arm: [235, 140, 255],
      top: [215, 185, 255], mid: [145, 80, 255], rim: [230, 215, 255], gonad: [130, 255, 225],
    },
  },
  {
    at: 80,
    name: "Corail de feu",
    pal: {
      halo: [255, 120, 90], tent: [255, 185, 150], arm: [255, 225, 140],
      top: [255, 220, 200], mid: [255, 125, 95], rim: [255, 235, 220], gonad: [255, 250, 160],
    },
  },
];

// Easter egg : la méduse lune dorée
const GOLD = {
  halo: [255, 205, 100], tent: [255, 225, 150], arm: [255, 195, 115],
  top: [255, 242, 195], mid: [255, 195, 80], rim: [255, 248, 210], gonad: [255, 160, 80],
};
const GOLD_DURATION = 10; // secondes
const SECRET_WORD = "lune";
const SECRET_TAPS = 5; // touches rapides sur la méduse

const clonePal = (pal) => Object.fromEntries(Object.entries(pal).map(([k, c]) => [k, [...c]]));
const rgba = (c, a) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;

function tierFor(value) {
  let index = 0;
  TIERS.forEach((t, i) => {
    if (value >= t.at) index = i;
  });
  return index;
}

// ---------- État ----------
let jelly;
let plankton;
let sparks;
let turtles;
let bubbles;
let score;
let best = readBest();
let running = false;
let paused = false;
let screen = "intro"; // ce qu'affiche l'écran par-dessus le jeu : intro, pause ou fin
let lastInput = "mouse";
let lastTime = 0;
let elapsed = 0;
let turtleTimer = 0;
let tierIndex = 0;
let golden = 0; // temps restant en mode doré
let goldenUsed = false; // une seule fois par partie
let typed = "";
let taps = [];
let banner = null; // { text, color, life }

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
    hx: rand(24, W - 24), // point d'ancrage autour duquel il dérive
    hy: rand(70, H - 40),
    x: 0,
    y: 0,
    r: rand(4, 6),
    phase: rand(0, Math.PI * 2),
    age: 0,
  };
}

function spawnTurtle() {
  const fromLeft = Math.random() < 0.5;
  const speed = (rand(70, 120) + elapsed * 3) * cfg.turtleSpeed; // ça accélère avec le temps
  const y = rand(40, H - 40);
  return {
    x: fromLeft ? -50 : W + 50,
    y,
    baseY: y,
    vx: fromLeft ? speed : -speed,
    r: 22,
    phase: rand(0, Math.PI * 2),
  };
}

function reset() {
  jelly = createJelly(W / 2, H * 0.7);
  plankton = Array.from({ length: cfg.plankton }, spawnPlankton);
  sparks = [];
  turtles = [];
  score = 0;
  elapsed = 0;
  turtleTimer = 1.5;
  tierIndex = 0;
  golden = 0;
  goldenUsed = false;
  typed = "";
  taps = [];
  banner = null;
  pointer.x = jelly.x;
  pointer.y = jelly.y;
  scoreEl.textContent = "0";
}

// ---------- Boucle de jeu ----------
function start() {
  reset();
  overlay.hidden = true;
  running = true;
  paused = false;
}

function showOverlay(title, html, button) {
  overlayTitle.textContent = title;
  overlayText.innerHTML = html;
  playBtn.textContent = button;
  overlay.hidden = false;
  playBtn.focus({ preventScroll: true });
}

function pause() {
  if (!running || paused) return;
  paused = true;
  screen = "pause";
  keys.clear();
  showOverlay(
    "Pause",
    mode === "desktop" ? "<kbd>Échap</kbd> ou <kbd>Entrée</kbd> pour reprendre." : "La méduse t'attend.",
    "Reprendre"
  );
}

function resume() {
  if (!paused) return;
  paused = false;
  overlay.hidden = true;
}

function gameOver() {
  running = false;
  screen = "over";
  if (score > best) {
    best = score;
    saveBest(best);
    bestEl.textContent = best;
    overlayTitle.textContent = "Nouveau record !";
  } else {
    overlayTitle.textContent = "Croquée !";
  }
  overlayText.textContent =
    `Ta méduse a mangé ${score} plancton${score > 1 ? "s" : ""}` +
    ` et a atteint la couleur ${TIERS[tierIndex].name}.`;
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
  if (running && !paused) update(dt);
  draw(time);

  requestAnimationFrame(loop);
}

function update(dt) {
  elapsed += dt;

  // Déplacement clavier : on pousse la cible
  let dx = 0;
  let dy = 0;
  for (const code of keys) {
    dx += MOVE[code][0];
    dy += MOVE[code][1];
  }
  dx = Math.sign(dx);
  dy = Math.sign(dy);
  if (dx || dy) {
    // Cible placée à distance fixe devant la méduse : la vitesse ne dépend
    // plus de la fréquence d'images, et la diagonale n'est pas plus rapide.
    const len = Math.hypot(dx, dy);
    pointer.x = jelly.x + (dx / len) * KEY_LEAD;
    pointer.y = jelly.y + (dy / len) * KEY_LEAD;
  }

  updateJelly(jelly, dt);

  // Mode doré et couleur courante, qui glisse vers la couleur cible
  if (golden > 0) {
    golden = Math.max(0, golden - dt);
    if (golden === 0) showBanner(TIERS[tierIndex].name, TIERS[tierIndex].pal.halo);
  }
  const target = golden > 0 ? GOLD : TIERS[tierIndex].pal;
  const blend = 1 - Math.exp(-4 * dt);
  for (const key in target) {
    for (let c = 0; c < 3; c++) {
      jelly.col[key][c] += (target[key][c] - jelly.col[key][c]) * blend;
    }
  }
  if (banner) {
    banner.life -= dt;
    if (banner.life <= 0) banner = null;
  }

  // Plancton : dérive lente, puis mangé au contact
  for (let i = 0; i < plankton.length; i++) {
    const p = plankton[i];
    p.age += dt;
    p.x = p.hx + Math.sin(elapsed * 0.7 + p.phase) * 10;
    p.y = p.hy + Math.cos(elapsed * 0.5 + p.phase * 1.3) * 7;
    if (p.age > 0.3 && dist(jelly, p) < jelly.r + p.r) {
      burst(p.x, p.y, golden > 0 ? GOLD.halo : [160, 255, 230]);
      plankton[i] = spawnPlankton();
      score += golden > 0 ? 2 : 1;
      scoreEl.textContent = score;

      const next = tierFor(score);
      if (next > tierIndex) {
        tierIndex = next;
        const tier = TIERS[tierIndex];
        burst(jelly.x, jelly.y, tier.pal.halo, 30);
        if (golden === 0) showBanner(tier.name, tier.pal.halo);
      }
    }
  }

  for (const s of sparks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 1 - 2.5 * dt;
    s.vy *= 1 - 2.5 * dt;
    s.life -= dt * 1.4;
  }
  sparks = sparks.filter((s) => s.life > 0);

  // Tortues
  turtleTimer -= dt;
  if (turtleTimer <= 0) {
    turtles.push(spawnTurtle());
    turtleTimer = Math.max(0.5, 2 - elapsed * 0.03) * cfg.turtleGap;
  }
  for (const t of turtles) {
    t.x += t.vx * dt;
    t.phase += dt * 2.4;
    t.y = t.baseY + Math.sin(t.phase * 0.5) * 5;
    if (!t.fleeing && dist(jelly, t) < jelly.r + t.r - 6) {
      if (golden > 0) {
        // La méduse dorée repousse la tortue, qui fait demi-tour pour de bon
        t.fleeing = true;
        t.vx = -t.vx * 1.4;
        burst(t.x, t.y, GOLD.halo, 20);
      } else {
        gameOver();
        return;
      }
    }
  }
  turtles = turtles.filter((t) => t.x > -70 && t.x < W + 70);
}

// ---------- Dessin ----------
function draw(time) {
  drawWater(time);
  for (const p of plankton) drawPlankton(p, time);
  drawSparks();
  for (const t of turtles) drawTurtle(t);
  drawJelly(jelly);
  drawVignette();
  drawReticle();
  drawBanner();
}

// Petit viseur discret là où pointe la souris (le curseur est masqué)
function drawReticle() {
  if (!running || paused || lastInput !== "mouse" || mode !== "desktop") return;
  ctx.save();
  ctx.strokeStyle = "rgba(200, 230, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(200, 230, 255, 0.6)";
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------- Méduse dorée et annonces ----------
function showBanner(text, color) {
  banner = { text, color, life: 2 };
}

function activateGolden() {
  if (!running || goldenUsed) return;
  goldenUsed = true;
  golden = GOLD_DURATION;
  burst(jelly.x, jelly.y, GOLD.halo, 40);
  showBanner("Méduse lune dorée !", GOLD.halo);
}

function drawBanner() {
  if (!banner) return;
  const a = Math.min(1, banner.life / 0.5) * Math.min(1, (2 - banner.life) / 0.25);
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `700 ${mode === "desktop" ? 30 : 22}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.shadowColor = rgba(banner.color, 0.9 * a);
  ctx.shadowBlur = 16;
  ctx.fillStyle = rgba([255, 255, 255], a);
  ctx.fillText(banner.text, W / 2, mode === "desktop" ? 110 : 96);
  ctx.restore();
}

// ---------- Eau ----------
// Plusieurs couches légères qui bougent à des vitesses différentes :
// dégradé de profondeur, rayons de lumière, reflets de surface et neige marine.

let RAYS, SNOW, waterGradient, vignette;

// Recrée le décor quand la taille du monde change
function buildScene() {
  const rayCount = Math.round(W / 80);
  RAYS = Array.from({ length: rayCount }, (_, i) => ({
    x: (i + 0.5) * (W / rayCount) + rand(-30, 30),
    width: rand(30, 70),
    spread: rand(60, 140),
    speed: rand(0.12, 0.25),
    phase: rand(0, Math.PI * 2),
    strength: rand(0.05, 0.1),
  }));

  SNOW = Array.from({ length: Math.round((W * H) / 4400) }, () => ({
    x: rand(0, W),
    y: rand(0, H),
    z: rand(0.25, 1), // profondeur : 1 = proche
    phase: rand(0, Math.PI * 2),
  }));

  // Le fond ne change pas pendant la partie : on le prépare une fois
  waterGradient = (() => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#164a7a");
    g.addColorStop(0.35, "#0b2852");
    g.addColorStop(0.75, "#05132e");
    g.addColorStop(1, "#020714");
    return g;
  })();

  vignette = (() => {
    const reach = Math.max(W, H);
    const g = ctx.createRadialGradient(W / 2, H * 0.45, reach * 0.3, W / 2, H * 0.45, reach * 0.8);
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(1, "rgba(0, 4, 14, 0.55)");
    return g;
  })();
}

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

// ---------- Plancton ----------
// Un petit point bioluminescent : cœur net, halo doux et quelques
// particules qui tournent autour.

function burst(x, y, color = [160, 255, 230], count = 14) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(20, 70) * (count > 14 ? 1.6 : 1);
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.6, 1), color });
  }
}

function drawPlankton(p, time) {
  const fade = Math.min(1, p.age / 0.8);
  const breath = 0.65 + Math.sin(time * 2.2 + p.phase) * 0.35;
  const a = fade * breath;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
  halo.addColorStop(0, `rgba(120, 255, 220, ${0.5 * a})`);
  halo.addColorStop(0.4, `rgba(80, 220, 255, ${0.12 * a})`);
  halo.addColorStop(1, "rgba(80, 220, 255, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(p.x - p.r * 5, p.y - p.r * 5, p.r * 10, p.r * 10);

  ctx.fillStyle = `rgba(225, 255, 245, ${0.9 * a})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * 0.45, 0, Math.PI * 2);
  ctx.fill();

  for (let k = 0; k < 3; k++) {
    const ang = time * (0.8 + k * 0.3) + p.phase + (k * Math.PI * 2) / 3;
    const d = p.r * (1.1 + k * 0.35);
    ctx.fillStyle = `rgba(160, 255, 230, ${0.55 * a})`;
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d * 0.7, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawSparks() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const s of sparks) {
    ctx.fillStyle = rgba(s.color, s.life * 0.8);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 0.6 + s.life, 0, Math.PI * 2);
    ctx.fill();
  }
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
  const j = {
    x, y, r: 24, pulse: 0, contraction: 0, rx: 24, ry: 24, tentacles, arms,
    col: clonePal(TIERS[0].pal),
  };
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
    ctx.strokeStyle = rgba(rgb, alpha * (1 - t));
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
  const { rx, ry, col } = j;
  const glow = golden > 0 ? 0.14 : 0; // la méduse dorée brille plus fort

  ctx.save();
  ctx.lineCap = "round";
  ctx.globalCompositeOperation = "lighter";

  // Halo bioluminescent
  const halo = ctx.createRadialGradient(j.x, j.y - ry * 0.3, 0, j.x, j.y - ry * 0.3, j.r * 3.2);
  halo.addColorStop(0, rgba(col.halo, 0.16 + glow + j.contraction * 0.08));
  halo.addColorStop(1, rgba(col.halo, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(j.x - j.r * 4, j.y - j.r * 4, j.r * 8, j.r * 8);

  // Anneau doré qui se vide : temps restant du mode doré
  if (golden > 0) {
    const blink = golden < 2 ? 0.5 + Math.sin(golden * 18) * 0.5 : 1;
    ctx.strokeStyle = rgba(GOLD.halo, 0.6 * blink);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(j.x, j.y - ry * 0.2, j.r * 1.9, -Math.PI / 2, -Math.PI / 2 + (golden / GOLD_DURATION) * Math.PI * 2);
    ctx.stroke();
  }

  // Filaments fins puis bras buccaux plus épais
  for (const t of j.tentacles) strokeChain(t, col.tent, 0.55);
  for (const a of j.arms) strokeChain(a, col.arm, 0.35);

  ctx.translate(j.x, j.y);

  // Ombrelle translucide
  const body = ctx.createLinearGradient(0, -ry, 0, ry * 0.2);
  body.addColorStop(0, rgba(col.top, 0.42 + glow));
  body.addColorStop(0.7, rgba(col.mid, 0.16 + glow));
  body.addColorStop(1, rgba(col.mid, 0.06));
  ctx.fillStyle = body;
  bellPath(rx, ry);
  ctx.fill();

  // Liseré lumineux
  ctx.strokeStyle = rgba(col.rim, 0.55);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Bande interne plus claire, pour le volume
  ctx.strokeStyle = rgba(col.rim, 0.18);
  ctx.beginPath();
  ctx.ellipse(0, -ry * 0.05, rx * 0.82, ry * 0.18, 0, Math.PI, 0);
  ctx.stroke();

  // Gonades en trèfle, comme une méduse lune
  ctx.strokeStyle = rgba(col.gonad, 0.45);
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

// ---------- Tortue ----------
// Silhouette sombre en contre-jour : seuls les contours captent la lumière.

const TURTLE_FILL = "rgba(5, 16, 30, 0.94)";
const TURTLE_RIM = "rgba(150, 205, 255, 0.42)";

function flipper(len, width, angle) {
  ctx.save();
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -width * 0.5);
  ctx.bezierCurveTo(-len * 0.2, -width, -len * 0.75, -width * 0.4, -len, 0);
  ctx.bezierCurveTo(-len * 0.7, width * 0.35, -len * 0.25, width * 0.6, 0, width * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTurtle(t) {
  const r = t.r;
  const dir = Math.sign(t.vx);
  const stroke = Math.sin(t.phase); // battement des nageoires

  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.scale(dir, 1);
  ctx.fillStyle = TURTLE_FILL;
  ctx.strokeStyle = TURTLE_RIM;
  ctx.lineWidth = 1;

  // Nageoires arrière
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(-r * 0.7, side * r * 0.4);
    flipper(r * 0.55, r * 0.3, -side * (0.5 + stroke * 0.15));
    ctx.restore();
  }

  // Nageoires avant, longues comme des ailes
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(r * 0.35, side * r * 0.45);
    flipper(r * 1.45, r * 0.42, -side * (0.85 + stroke * 0.45));
    ctx.restore();
  }

  // Tête
  ctx.beginPath();
  ctx.ellipse(r * 1.08, 0, r * 0.36, r * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Carapace en goutte
  ctx.beginPath();
  ctx.moveTo(r * 0.85, 0);
  ctx.bezierCurveTo(r * 0.85, -r * 0.82, -r * 0.75, -r * 0.8, -r * 1.05, 0);
  ctx.bezierCurveTo(-r * 0.75, r * 0.8, r * 0.85, r * 0.82, r * 0.85, 0);
  ctx.fill();
  ctx.stroke();

  // Reflet de lumière venant de la surface
  const sheen = ctx.createLinearGradient(0, -r * 0.7, 0, r * 0.7);
  sheen.addColorStop(0, "rgba(120, 180, 230, 0.16)");
  sheen.addColorStop(0.5, "rgba(120, 180, 230, 0)");
  ctx.fillStyle = sheen;
  ctx.fill();

  // Écailles, à peine visibles
  ctx.strokeStyle = "rgba(150, 205, 255, 0.1)";
  ctx.beginPath();
  ctx.moveTo(r * 0.55, 0);
  ctx.lineTo(r * 0.2, -r * 0.28);
  ctx.lineTo(-r * 0.35, -r * 0.28);
  ctx.lineTo(-r * 0.7, 0);
  ctx.lineTo(-r * 0.35, r * 0.28);
  ctx.lineTo(r * 0.2, r * 0.28);
  ctx.closePath();
  ctx.moveTo(r * 0.2, -r * 0.28);
  ctx.lineTo(r * 0.2, r * 0.28);
  ctx.moveTo(-r * 0.35, -r * 0.28);
  ctx.lineTo(-r * 0.35, r * 0.28);
  ctx.stroke();

  ctx.restore();
}

// ---------- Entrées ----------
function setPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * W;
  pointer.y = ((event.clientY - rect.top) / rect.height) * H;
}

canvas.addEventListener("pointermove", (e) => {
  setPointer(e);
  if (e.pointerType === "mouse") lastInput = "mouse";
});
canvas.addEventListener("pointerdown", (e) => {
  setPointer(e);
  // Secret : plusieurs touches rapides sur la méduse
  if (!running || dist(pointer, jelly) > jelly.r * 1.8) return;
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2000);
  taps.push(now);
  if (taps.length >= SECRET_TAPS) activateGolden();
});

window.addEventListener("keydown", (e) => {
  if (MOVE[e.code]) {
    e.preventDefault();
    if (running && !paused) {
      keys.add(e.code);
      lastInput = "keys";
    }
    return;
  }

  if (e.code === "Escape" || e.code === "KeyP") {
    if (paused) resume();
    else pause();
    return;
  }

  if (e.code === "KeyF" && !e.repeat) {
    toggleFullscreen();
    return;
  }

  if ((e.code === "Enter" || e.code === "Space") && !overlay.hidden) {
    // Si le bouton a le focus, le navigateur le déclenche déjà
    if (document.activeElement !== playBtn) {
      e.preventDefault();
      playBtn.click();
    }
    return;
  }

  if (running && !paused && e.key.length === 1) {
    // Secret : taper le mot magique pendant une partie
    typed = (typed + e.key.toLowerCase()).slice(-SECRET_WORD.length);
    if (typed === SECRET_WORD) activateGolden();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

// Pause automatique quand on quitte la fenêtre
window.addEventListener("blur", () => {
  keys.clear();
  pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});

playBtn.addEventListener("click", () => (paused ? resume() : start()));

// ---------- Plein écran ----------
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

fullscreenBtn.addEventListener("click", () => {
  toggleFullscreen();
  fullscreenBtn.blur();
});
document.addEventListener("fullscreenchange", () => {
  fullscreenBtn.textContent = document.fullscreenElement ? "Quitter le plein écran" : "Plein écran";
});

// ---------- Format et résolution ----------
function rescaleWorld(sx, sy) {
  const move = (p) => {
    p.x *= sx;
    p.y *= sy;
  };
  move(jelly);
  move(pointer);
  for (const chain of [...jelly.tentacles, ...jelly.arms]) chain.points.forEach(move);
  for (const p of plankton) {
    p.hx *= sx;
    p.hy *= sy;
  }
  for (const t of turtles) {
    t.x *= sx;
    t.y *= sy;
    t.baseY *= sy;
  }
  sparks.forEach(move);
  while (plankton.length < cfg.plankton) plankton.push(spawnPlankton());
  plankton.length = cfg.plankton;
}

function applyLayout() {
  const next = desktopQuery.matches ? "desktop" : "mobile";
  if (next !== mode) {
    const old = mode ? cfg : null;
    mode = next;
    cfg = MODES[mode];
    W = cfg.W;
    H = cfg.H;
    document.body.classList.toggle("desktop", mode === "desktop");
    canvas.style.aspectRatio = `${W} / ${H}`;
    if (old && jelly) rescaleWorld(W / old.W, H / old.H);
    buildScene();
    if (screen === "intro") overlayText.innerHTML = INTRO[mode];
  }

  // Résolution réelle : net sur les grands écrans et les écrans Retina
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const scale = canvas.width / W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

window.addEventListener("resize", applyLayout);

// Écran d'accueil
applyLayout();
reset();
lastTime = performance.now();
requestAnimationFrame(loop);
