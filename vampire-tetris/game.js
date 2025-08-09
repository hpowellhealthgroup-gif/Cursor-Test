/* Vampire Tetris - Canvas Implementation */

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30; // canvas pixels per cell
const BOARD_W = COLS * BLOCK_SIZE;
const BOARD_H = ROWS * BLOCK_SIZE;

// Speed ramp per level (ms per drop)
const LEVEL_SPEED = [
  800, 720, 650, 580, 520, 470, 430, 390, 360, 330,
  300, 270, 240, 210, 190, 170, 150, 140, 130, 120
];

// Vampire theme palette
const COLORS = {
  I: '#9b1d2b',
  J: '#471327',
  L: '#6f1a2d',
  O: '#8a1e2f',
  S: '#b82034',
  T: '#5e163a',
  Z: '#d02b3a',
  GHOST: 'rgba(200, 60, 70, 0.25)',
  LOCKED: '#1a1016'
};

// Tetrimino rotation states (4x4 matrices)
const SHAPES = {
  I: [
    [ [0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0] ],
    [ [0,0,1,0], [0,0,1,0], [0,0,1,0], [0,0,1,0] ],
    [ [0,0,0,0], [0,0,0,0], [1,1,1,1], [0,0,0,0] ],
    [ [0,1,0,0], [0,1,0,0], [0,1,0,0], [0,1,0,0] ]
  ],
  J: [
    [ [1,0,0], [1,1,1], [0,0,0] ],
    [ [0,1,1], [0,1,0], [0,1,0] ],
    [ [0,0,0], [1,1,1], [0,0,1] ],
    [ [0,1,0], [0,1,0], [1,1,0] ]
  ],
  L: [
    [ [0,0,1], [1,1,1], [0,0,0] ],
    [ [0,1,0], [0,1,0], [0,1,1] ],
    [ [0,0,0], [1,1,1], [1,0,0] ],
    [ [1,1,0], [0,1,0], [0,1,0] ]
  ],
  O: [
    [ [1,1], [1,1] ],
    [ [1,1], [1,1] ],
    [ [1,1], [1,1] ],
    [ [1,1], [1,1] ]
  ],
  S: [
    [ [0,1,1], [1,1,0], [0,0,0] ],
    [ [0,1,0], [0,1,1], [0,0,1] ],
    [ [0,0,0], [0,1,1], [1,1,0] ],
    [ [1,0,0], [1,1,0], [0,1,0] ]
  ],
  T: [
    [ [0,1,0], [1,1,1], [0,0,0] ],
    [ [0,1,0], [0,1,1], [0,1,0] ],
    [ [0,0,0], [1,1,1], [0,1,0] ],
    [ [0,1,0], [1,1,0], [0,1,0] ]
  ],
  Z: [
    [ [1,1,0], [0,1,1], [0,0,0] ],
    [ [0,0,1], [0,1,1], [0,1,0] ],
    [ [0,0,0], [1,1,0], [0,1,1] ],
    [ [0,1,0], [1,1,0], [1,0,0] ]
  ]
};

const PIECE_KEYS = Object.keys(SHAPES);

/** Utility random bag for fair distribution */
class PieceBag {
  constructor() { this.queue = []; this.refill(); }
  refill() {
    const set = [...PIECE_KEYS];
    for (let i = set.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [set[i], set[j]] = [set[j], set[i]];
    }
    this.queue.push(...set);
  }
  next() {
    if (this.queue.length === 0) this.refill();
    return this.queue.shift();
  }
  peek(n = 3) {
    while (this.queue.length < n) this.refill();
    return this.queue.slice(0, n);
  }
}

/** Game state */
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
canvas.width = BOARD_W; canvas.height = BOARD_H;

const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');

const ui = {
  score: document.getElementById('score'),
  level: document.getElementById('level'),
  lines: document.getElementById('lines'),
  best: document.getElementById('best'),
  overlay: document.getElementById('overlay')
};

const controls = {
  restartBtn: document.getElementById('restartBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  hardDropBtn: document.getElementById('hardDropBtn'),
  overlayRestart: document.getElementById('overlayRestart')
};

let grid; // ROWS x COLS of 0 or color string
let bag;
let currentPiece;
let currentKey;
let rotationIndex;
let position;
let ghostY;
let dropTimer = 0;
let dropInterval = LEVEL_SPEED[0];
let lastTime = 0;
let isPaused = false;
let isGameOver = false;
let score = 0;
let linesCleared = 0;
let level = 1;
let bestScore = Number(localStorage.getItem('vampire_tetris_best') || '0');
ui.best.textContent = bestScore.toString();

const particles = [];

function createEmptyGrid() {
  const g = [];
  for (let r = 0; r < ROWS; r++) {
    g.push(new Array(COLS).fill(0));
  }
  return g;
}

function spawnPiece() {
  currentKey = bag.next();
  rotationIndex = 0;
  position = { x: Math.floor(COLS / 2) - 2, y: -2 };
  currentPiece = SHAPES[currentKey][rotationIndex];
  if (collides(position.x, position.y, currentPiece)) {
    gameOver();
  }
  updateGhost();
}

function rotate(dir) {
  if (currentKey === 'O') return; // O piece rotation no-op
  const nextIndex = (rotationIndex + dir + 4) % 4;
  const nextShape = SHAPES[currentKey][nextIndex];
  const kicks = [ {x:0,y:0}, {x:1,y:0}, {x:-1,y:0}, {x:2,y:0}, {x:-2,y:0}, {x:0,y:-1} ];
  for (const k of kicks) {
    if (!collides(position.x + k.x, position.y + k.y, nextShape)) {
      rotationIndex = nextIndex;
      currentPiece = nextShape;
      position.x += k.x; position.y += k.y;
      updateGhost();
      return;
    }
  }
}

function move(dx) {
  if (!collides(position.x + dx, position.y, currentPiece)) {
    position.x += dx;
    updateGhost();
  }
}

function softDrop() {
  if (!collides(position.x, position.y + 1, currentPiece)) {
    position.y += 1;
  } else {
    lockPiece();
  }
}

function hardDrop() {
  position.y = ghostY;
  lockPiece();
}

function lockPiece() {
  traverse(currentPiece, (x, y) => {
    const gx = position.x + x;
    const gy = position.y + y;
    if (gy >= 0) grid[gy][gx] = COLORS[currentKey];
  });
  clearLines();
  spawnPiece();
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (grid[r].every(cell => cell !== 0)) {
      cleared++;
      spawnBloodRow(r);
      grid.splice(r, 1);
      grid.unshift(new Array(COLS).fill(0));
      r++; // recheck same row index after unshift
    }
  }
  if (cleared > 0) {
    const lineScore = [0, 100, 300, 500, 800][cleared] || (cleared * 300);
    score += lineScore * level;
    linesCleared += cleared;
    level = 1 + Math.floor(linesCleared / 10);
    dropInterval = LEVEL_SPEED[Math.min(LEVEL_SPEED.length - 1, level - 1)];
    updateUI();
  }
}

function updateGhost() {
  let gy = position.y;
  while (!collides(position.x, gy + 1, currentPiece)) gy++;
  ghostY = gy;
}

function collides(px, py, shape) {
  let collision = false;
  traverse(shape, (x, y) => {
    const gx = px + x;
    const gy = py + y;
    if (gx < 0 || gx >= COLS || gy >= ROWS) {
      collision = true; return;
    }
    if (gy >= 0 && grid[gy][gx] !== 0) {
      collision = true; return;
    }
  });
  return collision;
}

function traverse(shape, fn) {
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) fn(x, y);
    }
  }
}

function updateUI() {
  ui.score.textContent = score.toString();
  ui.level.textContent = level.toString();
  ui.lines.textContent = linesCleared.toString();
  if (score > bestScore) {
    bestScore = score;
    ui.best.textContent = bestScore.toString();
    localStorage.setItem('vampire_tetris_best', String(bestScore));
  }
}

function gameOver() {
  isGameOver = true;
  ui.overlay.classList.remove('hidden');
}

function resetGame() {
  grid = createEmptyGrid();
  bag = new PieceBag();
  score = 0; linesCleared = 0; level = 1; dropInterval = LEVEL_SPEED[0];
  isPaused = false; isGameOver = false; particles.length = 0;
  ui.overlay.classList.add('hidden');
  spawnPiece();
  updateUI();
}

// Input
window.addEventListener('keydown', (e) => {
  if (isGameOver) return;
  if (e.code === 'ArrowLeft') { e.preventDefault(); move(-1); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); move(1); }
  else if (e.code === 'ArrowDown') { e.preventDefault(); softDrop(); }
  else if (e.code === 'ArrowUp') { e.preventDefault(); rotate(1); }
  else if (e.code === 'Space') { e.preventDefault(); hardDrop(); }
  else if (e.code === 'KeyP') { e.preventDefault(); togglePause(); }
  else if (e.code === 'KeyR') { e.preventDefault(); resetGame(); }
});

controls.restartBtn.addEventListener('click', resetGame);
controls.pauseBtn.addEventListener('click', togglePause);
controls.hardDropBtn.addEventListener('click', hardDrop);
controls.overlayRestart.addEventListener('click', resetGame);

function togglePause() {
  if (isGameOver) return;
  isPaused = !isPaused;
}

// Rendering
function draw(now = 0) {
  const delta = now - lastTime;
  lastTime = now;

  if (!isPaused && !isGameOver) {
    dropTimer += delta;
    if (dropTimer >= dropInterval) {
      softDrop();
      dropTimer = 0;
    }
  }

  drawScene();
  requestAnimationFrame(draw);
}

function drawScene() {
  // Background with moon and castle silhouette
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);
  drawNightSky();
  drawCastle();
  drawBats();

  // Board cells
  drawBoardCells();

  // Ghost
  drawPiece(position.x, ghostY, currentPiece, COLORS.GHOST, true);

  // Current piece
  drawPiece(position.x, position.y, currentPiece, COLORS[currentKey]);

  // Particles
  updateParticles();

  // Next
  drawNextPreview();
}

function drawNightSky() {
  const grd = ctx.createLinearGradient(0, 0, 0, BOARD_H);
  grd.addColorStop(0, 'rgba(255, 236, 180, 0.08)');
  grd.addColorStop(0.4, 'rgba(100, 80, 120, 0.05)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);

  // Moon
  const moonX = BOARD_W - 70;
  ctx.beginPath();
  ctx.arc(moonX, 60, 25, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 240, 200, 0.35)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(moonX - 8, 58, 18, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 240, 220, 0.45)';
  ctx.fill();
}

function drawCastle() {
  ctx.save();
  ctx.fillStyle = 'rgba(40, 28, 48, 0.45)';
  const baseY = BOARD_H - 40;
  ctx.fillRect(0, baseY, BOARD_W, 40);
  // towers
  for (let i = 0; i < 4; i++) {
    const x = 20 + i * 70;
    const h = 30 + (i % 2) * 16;
    ctx.fillRect(x, baseY - h, 30, h);
    ctx.beginPath();
    ctx.moveTo(x - 2, baseY - h);
    ctx.lineTo(x + 15, baseY - h - 14);
    ctx.lineTo(x + 32, baseY - h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

let batTime = 0;
function drawBats() {
  batTime += 0.02;
  const batCount = 3;
  for (let i = 0; i < batCount; i++) {
    const t = batTime + i * 1.7;
    const x = (Math.sin(t * 0.5 + i) * 0.5 + 0.5) * (BOARD_W - 60) + 30;
    const y = 40 + Math.sin(t * 2 + i) * 10 + i * 8;
    drawBat(x, y, 0.8 + Math.sin(t) * 0.1);
  }
}

function drawBat(x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(40, 10, 20, 0.8)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-12, 6);
  ctx.lineTo(-24, 0);
  ctx.lineTo(-12, -6);
  ctx.lineTo(0, 0);
  ctx.lineTo(12, 6);
  ctx.lineTo(24, 0);
  ctx.lineTo(12, -6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBoardCells() {
  // grid background cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * BLOCK_SIZE;
      const y = r * BLOCK_SIZE;
      drawCellBackground(x, y);
      const val = grid[r][c];
      if (val !== 0) drawBlock(x, y, val);
    }
  }
}

function drawCellBackground(x, y) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
  ctx.restore();
}

function drawBlock(x, y, color) {
  // Coffin-like beveled block
  const r = 6;
  const inset = 2;
  const w = BLOCK_SIZE;
  const h = BLOCK_SIZE;

  // base
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, shade(color, 0.25));
  grad.addColorStop(1, shade(color, -0.15));
  roundedRect(x + 1, y + 1, w - 2, h - 2, r, grad);

  // inner bevel
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);

  // blood glint
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 6);
  ctx.lineTo(x + w - 6, y + 6);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.stroke();
}

function roundedRect(x, y, w, h, r, fillStyle) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function drawPiece(px, py, shape, color, isGhost = false) {
  traverse(shape, (x, y) => {
    const gx = (px + x) * BLOCK_SIZE;
    const gy = (py + y) * BLOCK_SIZE;
    if (gy < 0) return;
    if (isGhost) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      drawBlock(gx, gy, color);
      ctx.restore();
    } else {
      drawBlock(gx, gy, color);
    }
  });
}

function shade(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.min(255, Math.max(0, r + r * percent));
  g = Math.min(255, Math.max(0, g + g * percent));
  b = Math.min(255, Math.max(0, b + b * percent));
  return `rgb(${r|0}, ${g|0}, ${b|0})`;
}

// Particles: blood droplets on line clear
function spawnBloodRow(row) {
  const y = row * BLOCK_SIZE + BLOCK_SIZE / 2;
  for (let c = 0; c < COLS; c++) {
    const x = c * BLOCK_SIZE + BLOCK_SIZE / 2;
    for (let i = 0; i < 4; i++) {
      particles.push(bloodParticle(x, y));
    }
  }
}

function bloodParticle(x, y) {
  const angle = Math.random() * Math.PI;
  const speed = 1 + Math.random() * 2.5;
  return {
    x, y, vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed,
    life: 600 + Math.random() * 600,
    size: 2 + Math.random() * 2,
    gravity: 0.02 + Math.random() * 0.02,
    color: 'rgba(190, 0, 30, 0.8)'
  };
}

function updateParticles() {
  const now = performance.now();
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += p.gravity;
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 16;
    if (p.life <= 0 || p.y > BOARD_H + 10) {
      particles.splice(i, 1);
      continue;
    }
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawNextPreview() {
  const w = nextCanvas.width;
  const h = nextCanvas.height;
  nextCtx.clearRect(0, 0, w, h);
  // background vignette
  const g = nextCtx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.03)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  nextCtx.fillStyle = g;
  nextCtx.fillRect(0, 0, w, h);

  const queue = bag.peek(3);
  const cell = 24;
  const startY = 14;

  queue.forEach((key, idx) => {
    const shape = SHAPES[key][0];
    const color = COLORS[key];
    const { width, height } = getShapeBounds(shape);
    const offsetX = Math.floor((w - width * cell) / 2);
    const offsetY = startY + idx * 64 + Math.floor((50 - height * cell) / 2);
    drawMiniPiece(shape, color, offsetX, offsetY, cell);
  });
}

function getShapeBounds(shape) {
  let w = 0, h = 0;
  h = shape.length;
  w = Math.max(...shape.map(row => row.length));
  return { width: w, height: h };
}

function drawMiniPiece(shape, color, ox, oy, cell) {
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const gx = ox + x * cell;
      const gy = oy + y * cell;
      const grad = nextCtx.createLinearGradient(gx, gy, gx, gy + cell);
      grad.addColorStop(0, shade(color, 0.25));
      grad.addColorStop(1, shade(color, -0.15));
      nextCtx.fillStyle = grad;
      nextCtx.fillRect(gx + 1, gy + 1, cell - 2, cell - 2);
      nextCtx.strokeStyle = 'rgba(0,0,0,0.6)';
      nextCtx.strokeRect(gx + 1, gy + 1, cell - 2, cell - 2);
    }
  }
}

// Game loop start
resetGame();
requestAnimationFrame(draw);

// Resize handling for responsive canvas when CSS scales it down in small screens
window.addEventListener('resize', fixPixelRatio);
fixPixelRatio();

function fixPixelRatio() {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (cssWidth && cssHeight) {
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
  } else {
    canvas.width = BOARD_W;
    canvas.height = BOARD_H;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}