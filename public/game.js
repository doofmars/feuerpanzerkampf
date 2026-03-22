// ============================================================
// FEUERPANZERKAMPF – Complete Game Engine
// Canvas 1200×600 | Grid 600×300 | Scale 2×
// ============================================================
'use strict';

// ══════════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════════
const GRID_W   = 600;
const GRID_H   = 300;
const SCALE    = 2;
const CW       = GRID_W * SCALE;   // 1200
const CH       = GRID_H * SCALE;   // 600

// Cell types
const EMPTY   = 0;
const TERRAIN = 1;
const ACID    = 2;
const SNOW    = 3;
const BEDROCK = 4;
const GRASS   = 5;

// Physics
const GRAVITY         = 0.18;   // cells/frame² normal
const GUN_GRAVITY     = 0.04;   // reduced gravity for gun-shot
const MAX_POWER       = 22;     // max launch speed (cells/frame)
const CHARGE_RATE     = 0.28;   // power units per frame while held
const ANGLE_SPEED     = 1.2;    // degrees per frame while key held
const ACID_DAMAGE     = 1;      // HP per frame acid contacts player
const TANK_W_CELLS    = 14;     // tank body width in grid cells
const TANK_H_CELLS    = 6;      // tank body height in grid cells
const CANNON_LEN      = 14;     // cannon arm length in cells
const PROJECTILE_R    = 2;      // projectile visual radius (px)
const STARTING_MONEY  = 200;    // € each player starts with
const TOP_ESCAPE_LIMIT = GRID_H * 8;
const CLUSTER_FRAGMENT_MIN_SPEED = 2.1;
const CLUSTER_FRAGMENT_SPEED_RANGE = 0.9;
const ACID_SPLASH_MIN_RADIUS = 6;
const ACID_SPLASH_RADIUS_VARIANCE = 16;
const SHIELD_DURATION_FRAMES = 60 * 5; // 5s
const SHIELD_ACID_CLEAR_RADIUS = 12;
const BEDROCK_WAVE_FREQ_1 = 0.07;
const BEDROCK_WAVE_AMP_1 = 2;
const BEDROCK_WAVE_FREQ_2 = 0.19;
const BEDROCK_WAVE_AMP_2 = 1.2;
const GAME_LOOP_FPS = 30;
const GAME_LOOP_STEP_MS = 1000 / GAME_LOOP_FPS;
const GAME_LOOP_MAX_CATCHUP_STEPS = 3;
const GOD_REFOCUS_FRAMES = 55;
const BOT_AIM_VARIANCE = {
  easy: 26,
  medium: 10,
  hard: 4,
  expert: 0,
  god: 0,
};

// Player colors (body, highlight)
const PLAYER_PALETTE = [
  ['#e84040','#ff8080'],
  ['#3a7fd5','#70b0ff'],
  ['#3ab54a','#70e080'],
  ['#e8c040','#ffe080'],
  ['#c060c8','#e090f0'],
  ['#e07030','#ffaa60'],
];

// Weapon catalogue
const WEAPONS = {
  cannonball: {
    name:'Cannon Ball', icon:'💣', cost:0, unlimited:true,
    type:'ballistic', gravity:GRAVITY, powerScale:1.0,
    explodeR:14, damage:40, terrainDamage:true,
    desc:'Unlimited · arc · small blast',
  },
  rocket: {
    name:'Rocket', icon:'🚀', cost:25, unlimited:false,
    type:'ballistic', gravity:GRAVITY, powerScale:1.25,
    explodeR:26, damage:80, terrainDamage:true,
    desc:'Arc · large explosion',
  },
  acidbomb: {
    name:'Acid Bomb', icon:'☣️', cost:30, unlimited:false,
    type:'ballistic', gravity:GRAVITY, powerScale:0.85,
    explodeR:10, damage:10, terrainDamage:true,
    desc:'Splash acid particles',
  },
  snowball: {
    name:'Snow Ball', icon:'❄️', cost:10, unlimited:false,
    type:'ballistic', gravity:GRAVITY, powerScale:0.9,
    explodeR:0, damage:0, terrainDamage:false,
    desc:'Creates blocking snow sphere',
  },
  gunshot: {
    name:'Gun Shot', icon:'🔫', cost:120, unlimited:false,
    type:'ballistic', gravity:GUN_GRAVITY, powerScale:1.9,
    explodeR:7, damage:150, terrainDamage:true,
    desc:'High-speed flat trajectory',
  },
  laser: {
    name:'Laser', icon:'🔴', cost:250, unlimited:false,
    type:'laser', gravity:0, powerScale:1,
    explodeR:0, damage:50, terrainDamage:true,
    desc:'Instant beam · shreds terrain',
  },
  clusterbomb: {
    name:'Cluster Bomb', icon:'🧨', cost:140, unlimited:false,
    type:'cluster', gravity:GRAVITY, powerScale:1.0,
    explodeR:0, damage:0, terrainDamage:false,
    desc:'Splits mid-air into mini bombs',
  },
  shield: {
    name:'Shield', icon:'🛡️', cost:70, unlimited:false,
    type:'shield', gravity:0, powerScale:0,
    explodeR:0, damage:0, terrainDamage:false,
    desc:'Temporary barrier, clears nearby acid',
  },
  clusterFragment: {
    name:'Cluster Fragment', icon:'·', cost:0, unlimited:false,
    type:'ballistic', gravity:GRAVITY, powerScale:1.0,
    explodeR:10, damage:90, terrainDamage:true,
    desc:'Internal',
  },
};
const WEAPON_ORDER = ['cannonball','rocket','acidbomb','snowball','gunshot','laser','clusterbomb','shield'];

// ══════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════
let canvas, ctx;
let terrain;        // Uint8Array[GRID_W * GRID_H]
let colorSeed;      // Uint8Array – per-cell colour variation
let players = [];
let projectiles = [];
let laserBeams  = [];   // [{x1,y1,x2,y2,t}]  visual-only
let explosionFx = [];   // [{gx,gy,r,maxR,t,color}]
let acidPending = [];   // {gx,gy} cells to become acid (spawned this frame)

let phase = 'lobby';    // lobby | playing | roundEnd | shop
let roundNum  = 0;
let frameCount = 0;
let gameOver  = false;
let shopPlayerIdx = 0;
let bots = [];

// Sand physics tick rate (every N frames)
const SAND_EVERY = 1;

// Offscreen terrain image data
let terrainCanvas, terrainCtx, terrainImgData, terrainPixels32;
let terrainDirty = true;

// Input state
const keys = {};
const prevKeys = {};

// Socket.io
let socket = null;
let isOnline = false;
let isHost   = false;
let myPlayerIndices = [];   // which players I control locally
let myConnectionIdx = 0;
let myLocalCount = 1;
let roomCode = '';
let unlimitedAmmoMode = false;
let gameLoopLastTime = 0;
let gameLoopAccumulator = 0;
let onlineMultiplayerAvailable = false;
let touchControlsEnabled = false;

// DOM refs
const DOM = {};

// ══════════════════════════════════════════════════════════════
//  GRID HELPERS
// ══════════════════════════════════════════════════════════════
function idx(x, y) { return y * GRID_W + x; }

function getCell(x, y) {
  if (x < 0 || x >= GRID_W) return TERRAIN; // side walls solid
  if (y < 0) return EMPTY;                  // open sky ceiling
  if (y >= GRID_H) return TERRAIN;          // floor solid
  return terrain[idx(x, y)];
}

function setCell(x, y, v) {
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
  terrain[idx(x, y)] = v;
  terrainDirty = true;
}

// Encode/decode colour from position hash (stable, no per-cell storage needed)
function cellColorRGB(type, x, y) {
  const h = ((x * 73 ^ y * 137) & 0x1F);
  switch (type) {
    case GRASS: {
      const v = h & 0xF;
      return [58 + v, 140 + v, 52 + (v >> 1)];
    }
    case TERRAIN: {
      const v = h - 16;  // -16..+15
      return [120 + (v >> 1), 82 + (v >> 1), 34 + (v >> 2)];
    }
    case BEDROCK: {
      const v = h - 16;
      return [72 + (v >> 1), 72 + (v >> 1), 78 + (v >> 1)];
    }
    case ACID: {
      const v = h & 0xF;
      return [30 + v, 200 + v, 30 + v];
    }
    case SNOW: {
      const v = h & 0xF;
      return [210 + (v >> 1), 220 + (v >> 1), 255];
    }
    default:
      return [135, 186, 235]; // sky (shouldn't appear in image data)
  }
}

// ══════════════════════════════════════════════════════════════
//  TERRAIN GENERATION
// ══════════════════════════════════════════════════════════════
function generateTerrain(seed) {
  terrain = new Uint8Array(GRID_W * GRID_H);
  colorSeed = new Uint8Array(GRID_W * GRID_H);

  // Seeded PRNG (simple xorshift)
  let rng = seed >>> 0 || 12345;
  function rand() {
    rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
    return (rng >>> 0) / 0x100000000;
  }

  const heights = new Float32Array(GRID_W);
  const base = GRID_H * 0.68;
  const A = [45, 28, 16, 9, 5];
  const F = [0.012, 0.025, 0.05, 0.1, 0.19];
  const P = Array.from({length:5}, () => rand() * Math.PI * 2);

  for (let x = 0; x < GRID_W; x++) {
    let h = base;
    for (let i = 0; i < A.length; i++) h += A[i] * Math.sin(x * F[i] + P[i]);
    h += (rand() - 0.5) * 7;
    heights[x] = Math.max(GRID_H * 0.38, Math.min(GRID_H * 0.93, h));
  }
  // Smooth
  for (let pass = 0; pass < 4; pass++) {
    for (let x = 1; x < GRID_W - 1; x++)
      heights[x] = (heights[x-1] + heights[x] * 2 + heights[x+1]) / 4;
  }

  // Fill
  for (let x = 0; x < GRID_W; x++) {
    const surf = Math.floor(heights[x]);
    for (let y = surf; y < GRID_H; y++) {
      if (y === surf) terrain[idx(x,y)] = GRASS;
      else if (y >= GRID_H - 18 + Math.floor(Math.sin(x * BEDROCK_WAVE_FREQ_1) * BEDROCK_WAVE_AMP_1 + Math.sin(x * BEDROCK_WAVE_FREQ_2) * BEDROCK_WAVE_AMP_2)) {
        terrain[idx(x,y)] = BEDROCK;
      }
      else terrain[idx(x,y)] = TERRAIN;
      colorSeed[idx(x,y)] = Math.floor(rand() * 32);
    }
  }

  terrainDirty = true;
}

// Ground level at column x (first TERRAIN row from top)
function groundY(x) {
  for (let y = 0; y < GRID_H; y++)
    if (terrain[idx(x, y)] !== EMPTY) return y;
  return GRID_H - 1;
}

// ══════════════════════════════════════════════════════════════
//  TERRAIN IMAGE DATA
// ══════════════════════════════════════════════════════════════
function initTerrainCanvas() {
  terrainCanvas = document.createElement('canvas');
  terrainCanvas.width  = CW;
  terrainCanvas.height = CH;
  terrainCtx = terrainCanvas.getContext('2d');
  terrainImgData = terrainCtx.createImageData(CW, CH);
  terrainPixels32 = new Uint32Array(terrainImgData.data.buffer);
}

function rebuildTerrainImage() {
  // Sky gradient: fill all pixels with sky first
  const skyTop    = packRGB(30, 60, 120);
  const skyBottom = packRGB(100, 150, 220);

  for (let py = 0; py < CH; py++) {
    const t = py / CH;
    const sr = 30  + Math.round((100-30 )  * t);
    const sg = 60  + Math.round((150-60 )  * t);
    const sb = 120 + Math.round((220-120)  * t);
    const skyCol = packRGB(sr, sg, sb);
    for (let px = 0; px < CW; px++)
      terrainPixels32[py * CW + px] = skyCol;
  }

  // Draw terrain cells
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const cell = terrain[idx(gx, gy)];
      if (cell === EMPTY) continue;
      const [r, g, b] = cellColorRGB(cell, gx, gy);
      const col = packRGB(r, g, b);
      const px0 = gx * SCALE;
      const py0 = gy * SCALE;
      for (let dy = 0; dy < SCALE; dy++) {
        const row = (py0 + dy) * CW;
        for (let dx = 0; dx < SCALE; dx++)
          terrainPixels32[row + px0 + dx] = col;
      }
    }
  }

  terrainCtx.putImageData(terrainImgData, 0, 0);
  terrainDirty = false;
}

function packRGB(r, g, b) {
  return (0xFF000000 | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF)) >>> 0;
}

// ══════════════════════════════════════════════════════════════
//  SAND PHYSICS
// ══════════════════════════════════════════════════════════════
function updateSandPhysics() {
  // Process bottom-to-top; alternate horizontal direction per row
  for (let gy = GRID_H - 2; gy >= 0; gy--) {
    const leftFirst = ((gy + frameCount) & 1) === 0;
    for (let xi = 0; xi < GRID_W; xi++) {
      const gx = leftFirst ? xi : GRID_W - 1 - xi;
      const cell = terrain[idx(gx, gy)];
      if (cell === EMPTY) continue;
      let moved = false;

      // Try to fall straight down
      if (terrain[idx(gx, gy+1)] === EMPTY) {
        terrain[idx(gx, gy+1)] = cell;
        terrain[idx(gx, gy)]   = EMPTY;
        terrainDirty = true;
        moved = true;
      } else {
        // Try diagonal
        const dxA = leftFirst ? -1 :  1;
        const dxB = leftFirst ?  1 : -1;
        const nx0 = gx + dxA, nx1 = gx + dxB;
        if (nx0 >= 0 && nx0 < GRID_W && terrain[idx(nx0, gy+1)] === EMPTY) {
          terrain[idx(nx0, gy+1)] = cell;
          terrain[idx(gx,  gy)]   = EMPTY;
          terrainDirty = true;
          moved = true;
        } else if (nx1 >= 0 && nx1 < GRID_W && terrain[idx(nx1, gy+1)] === EMPTY) {
          terrain[idx(nx1, gy+1)] = cell;
          terrain[idx(gx,  gy)]   = EMPTY;
          terrainDirty = true;
          moved = true;
        }
      }

      // Extra lateral flow for acid when resting on solid ground
      if (cell === ACID && !moved) {
        const left = gx - 1, right = gx + 1;
        const chooseLeft = ((gx + gy + frameCount) & 1) === 0;
        const nxA = chooseLeft ? left : right;
        const nxB = chooseLeft ? right : left;
        if (nxA >= 0 && nxA < GRID_W && terrain[idx(nxA, gy)] === EMPTY) {
          terrain[idx(nxA, gy)] = ACID;
          terrain[idx(gx, gy)] = EMPTY;
          terrainDirty = true;
        } else if (nxB >= 0 && nxB < GRID_W && terrain[idx(nxB, gy)] === EMPTY) {
          terrain[idx(nxB, gy)] = ACID;
          terrain[idx(gx, gy)] = EMPTY;
          terrainDirty = true;
        }
      }
    }
  }

  // Apply any pending acid spawns
  for (const {gx, gy} of acidPending) {
    if (getCell(gx, gy) === EMPTY) setCell(gx, gy, ACID);
  }
  acidPending = [];
}

// ══════════════════════════════════════════════════════════════
//  PLAYER CLASS
// ══════════════════════════════════════════════════════════════
class Player {
  constructor(id, name, gx, color) {
    this.id        = id;
    this.name      = name;
    this.gx        = gx;     // grid x (center)
    this.gy        = 0;      // grid y (top of tank body) – updated each frame
    this.color     = color[0];
    this.colorHi   = color[1];
    this.hp        = 200;
    this.maxHp     = 200;
    this.money     = STARTING_MONEY;
    this.angle     = 90;     // degrees, 90 = straight up
    this.power     = 0;      // charge accumulator
    this.charging  = false;
    this.canShoot  = true;
    this.alive     = true;
    this.weapons   = {
      cannonball: Infinity,
      rocket: 5,
      acidbomb: 1,
      snowball: 3,
      gunshot: 3,
      laser: 1,
      clusterbomb: 0,
      shield: 2,
    };
    this.weaponIdx = 0;      // index into WEAPON_ORDER
    this.shieldUntilFrame = 0;
    this.bot = null;
  }

  get currentWeaponKey() { return WEAPON_ORDER[this.weaponIdx]; }

  snapToTerrain() {
    let surf = GRID_H - 1;
    for (let y = 0; y < GRID_H; y++) {
      const c = terrain[idx(this.gx, y)];
      if (c === TERRAIN || c === BEDROCK || c === GRASS) {
        surf = y;
        break;
      }
    }
    this.gy = surf - TANK_H_CELLS;
    if (this.gy < 0) this.gy = 0;
  }

  // cannon tip in grid coords
  cannonTip() {
    const rad = (this.angle * Math.PI) / 180;
    const cx = this.gx;
    const cy = this.gy + TANK_H_CELLS / 2;
    return {
      x: cx + CANNON_LEN * Math.cos(rad),
      y: cy - CANNON_LEN * Math.sin(rad),
    };
  }

  isLocallyControlled() {
    return myPlayerIndices.includes(this.id);
  }
}

// ══════════════════════════════════════════════════════════════
//  PROJECTILE CLASS
// ══════════════════════════════════════════════════════════════
class Projectile {
  constructor(ownerId, gx, gy, vx, vy, weaponKey) {
    this.ownerId   = ownerId;
    this.x = gx; this.y = gy;
    this.vx = vx; this.vy = vy;
    this.weapon    = WEAPONS[weaponKey];
    this.weaponKey = weaponKey;
    this.alive     = true;
    this.trail     = [];   // [{x,y}] last N positions
    this.age       = 0;
    this.splitted  = false;
  }

  getDirectHitPlayerAt(x, y) {
    const gx = Math.round(x);
    const gy = Math.round(y);
    for (const p of players) {
      if (!p.alive) continue;
      // Avoid immediate self-collision right at muzzle exit.
      if (p.id === this.ownerId && this.age <= 1) continue;
      if (Math.abs(p.gx - gx) <= TANK_W_CELLS / 2 &&
          Math.abs((p.gy + TANK_H_CELLS / 2) - gy) <= TANK_H_CELLS) {
        return p;
      }
    }
    return null;
  }

  update() {
    this.trail.push({x: this.x, y: this.y});
    if (this.trail.length > 12) this.trail.shift();
    this.age++;

    // Use sub-steps to avoid fast projectiles tunneling through terrain.
    const stepCount = Math.max(1, Math.min(14, Math.ceil(Math.max(Math.abs(this.vx), Math.abs(this.vy)))));
    const stepVx = this.vx / stepCount;
    const stepVy = this.vy / stepCount;

    for (let s = 0; s < stepCount; s++) {
      this.x += stepVx;
      this.y += stepVy;

      // Side walls are solid
      if (this.x < 0 || this.x >= GRID_W) {
        this.alive = false;
        triggerWeaponEffect(this.ownerId, this.weaponKey, this.x, Math.max(0, this.y));
        onProjectileResolved(this.ownerId);
        return;
      }
      // Bottom boundary explodes on floor impact
      if (this.y >= GRID_H - 1) {
        this.alive = false;
        triggerWeaponEffect(this.ownerId, this.weaponKey, this.x, GRID_H - 1);
        onProjectileResolved(this.ownerId);
        return;
      }
      // Open ceiling: projectiles can leave and come back down
      if (this.y < -TOP_ESCAPE_LIMIT) {
        this.alive = false;
        onProjectileResolved(this.ownerId);
        return;
      }

      const hitPlayer = this.getDirectHitPlayerAt(this.x, this.y);
      if (hitPlayer) {
        this.alive = false;
        const hitX = hitPlayer.gx;
        const hitY = hitPlayer.gy + TANK_H_CELLS / 2;
        triggerWeaponEffect(this.ownerId, this.weaponKey, hitX, hitY);
        onProjectileResolved(this.ownerId);
        return;
      }

      // Collision with terrain (TERRAIN or SNOW block projectiles; ACID does not)
      const gx = Math.round(this.x), gy = Math.round(this.y);
      const cell = getCell(gx, gy);
      if (cell !== EMPTY && cell !== ACID) {
        this.alive = false;
        triggerWeaponEffect(this.ownerId, this.weaponKey, this.x, this.y);
        onProjectileResolved(this.ownerId);
        return;
      }
    }

    this.vy += this.weapon.gravity;

    if (this.weaponKey === 'clusterbomb' && !this.splitted && this.age >= 26) {
      this.splitted = true;
      for (let i = 0; i < 7; i++) {
        const ang = (-Math.PI * 0.75) + (i / 6) * (Math.PI * 1.5);
        const spd = CLUSTER_FRAGMENT_MIN_SPEED + Math.random() * CLUSTER_FRAGMENT_SPEED_RANGE;
        // Inherit parent momentum and add radial split impulse.
        const fvx = this.vx + Math.cos(ang) * spd;
        const fvy = this.vy + Math.sin(ang) * spd * 0.7;
        projectiles.push(new Projectile(this.ownerId, this.x, this.y, fvx, fvy, 'clusterFragment'));
      }
      this.alive = false;
      onProjectileResolved(this.ownerId);
      return;
    }

    // Terrain collision is handled in sub-steps above.
  }
}

// ══════════════════════════════════════════════════════════════
//  WEAPON EFFECTS
// ══════════════════════════════════════════════════════════════

// Circular explosion: carve terrain, damage players
function explode(ownerId, gx, gy, radius, damage) {
  const gxI = Math.round(gx), gyI = Math.round(gy);
  const r2 = radius * radius;
  const x0 = Math.max(0, gxI - radius - 1);
  const x1 = Math.min(GRID_W - 1, gxI + radius + 1);
  const y0 = Math.max(0, gyI - radius - 1);
  const y1 = Math.min(GRID_H - 1, gyI + radius + 1);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - gxI, dy = y - gyI;
      if (dx*dx + dy*dy <= r2) {
        terrain[idx(x, y)] = EMPTY;
      }
    }
  }
  terrainDirty = true;

  // Add visual effect
  explosionFx.push({ gx: gxI, gy: gyI, r: 0, maxR: radius * SCALE * 1.4, t: 1.0,
    color: '#ff6020' });

  // Damage players in blast radius
  applyExplosionDamage(ownerId, gxI, gyI, radius, damage);
}

function applyExplosionDamage(ownerId, gxI, gyI, radius, maxDamage) {
  for (const p of players) {
    if (!p.alive) continue;
    const dx = p.gx - gxI;
    const dy = (p.gy + TANK_H_CELLS / 2) - gyI;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist <= radius) {
      const falloff = Math.max(0, 1 - dist / radius);
      const dmg = Math.round(maxDamage * falloff);
      if (dmg > 0) dealDamage(ownerId, p.id, dmg);
    }
  }
}

function triggerWeaponEffect(ownerId, weaponKey, gx, gy) {
  const w = WEAPONS[weaponKey];
  switch (weaponKey) {
    case 'cannonball':
    case 'gunshot':
    case 'rocket':
      explode(ownerId, gx, gy, w.explodeR, w.damage);
      break;

    case 'acidbomb': {
      // No explosion: just an acid splash cloud
      const count = 200;
      const chosen = new Set();
      let attempts = 0;

      while (chosen.size < count && attempts < count * 12) {
        attempts++;
        const ang = (Math.random() * Math.PI * 2);
        const r   = ACID_SPLASH_MIN_RADIUS + Math.random() * ACID_SPLASH_RADIUS_VARIANCE;
        const ax  = Math.round(gx + Math.cos(ang) * r);
        const ay  = Math.round(gy + Math.sin(ang) * r * 0.5);
        if (ax < 0 || ax >= GRID_W || ay < 0 || ay >= GRID_H) continue;
        if (getCell(ax, ay) !== EMPTY) continue;

        const cellIndex = idx(ax, ay);
        if (chosen.has(cellIndex)) continue;
        chosen.add(cellIndex);
        acidPending.push({ gx: ax, gy: ay });
      }
      explosionFx.push({ gx: Math.round(gx), gy: Math.round(gy), r: 0, maxR: 30,
        t: 1.0, color: '#40ff40' });
      break;
    }

    case 'clusterFragment':
      explode(ownerId, gx, gy, WEAPONS.clusterFragment.explodeR, WEAPONS.clusterFragment.damage);
      break;

    case 'clusterbomb':
      // If it impacts before splitting, do a smaller direct blast
      explode(ownerId, gx, gy, 16, 120);
      break;

    case 'snowball': {
      const sRadius = 28;
      const gxI = Math.round(gx), gyI = Math.round(gy);
      for (let sy = gyI - sRadius; sy <= gyI + sRadius; sy++) {
        for (let sx = gxI - sRadius; sx <= gxI + sRadius; sx++) {
          if (sx < 0 || sx >= GRID_W || sy < 0 || sy >= GRID_H) continue;
          const dx = sx - gxI, dy = sy - gyI;
          if (dx*dx + dy*dy <= sRadius*sRadius) {
            if (terrain[idx(sx,sy)] === EMPTY && Math.random() < 0.6)
              terrain[idx(sx,sy)] = SNOW;
          }
        }
      }
      terrainDirty = true;
      explosionFx.push({ gx: gxI, gy: gyI, r: 0, maxR: sRadius * SCALE * 1.2,
        t: 1.0, color: '#90c8ff' });
      break;
    }
  }
}

// Laser: instant ray cast from player
function fireLaser(player) {
  const tip  = player.cannonTip();
  const rad  = (player.angle * Math.PI) / 180;
  const dx   = Math.cos(rad);
  const dy   = -Math.sin(rad);
  let x = tip.x, y = tip.y;
  const w    = WEAPONS.laser;
  let hitPlayers = [];

  // Collect beam coords for visual
  const steps = [];

  for (let step = 0; step < GRID_W + GRID_H; step++) {
    x += dx; y += dy;
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) break;
    steps.push({x, y});

    const gx = Math.round(x), gy = Math.round(y);
    // Carve terrain
    if (terrain[idx(gx, gy)] !== EMPTY) {
      terrain[idx(gx, gy)] = EMPTY;
      terrainDirty = true;
    }
    // Damage players on this cell
    for (const p of players) {
      if (!p.alive || hitPlayers.includes(p.id)) continue;
      if (Math.abs(p.gx - gx) <= TANK_W_CELLS / 2 &&
          Math.abs((p.gy + TANK_H_CELLS/2) - gy) <= TANK_H_CELLS) {
        dealDamage(player.id, p.id, w.damage);
        hitPlayers.push(p.id);
      }
    }
  }

  // Store laser beam for visual (fades over 0.6 s)
  if (steps.length > 0) {
    laserBeams.push({
      x1: tip.x, y1: tip.y,
      x2: steps[steps.length-1].x, y2: steps[steps.length-1].y,
      t: 1.0,
    });
  }
}

// ══════════════════════════════════════════════════════════════
//  DAMAGE & MONEY
// ══════════════════════════════════════════════════════════════
// attackerId = null means environmental/neutral damage (no money effect)
function dealDamage(attackerId, targetId, amount) {
  const target   = players[targetId];
  const attacker = (attackerId !== null && attackerId !== undefined)
                   ? players[attackerId] : null;
  if (!target || !target.alive) return;
  if (target.shieldUntilFrame > frameCount) return;

  const actual = Math.min(amount, target.hp);
  target.hp -= actual;

  if (attackerId === null || attackerId === undefined) {
    // Environmental damage – no money effect
  } else if (attackerId === targetId) {
    // Self-damage: lose money (penalty for self-inflicted damage)
    if (attacker) attacker.money = Math.max(0, attacker.money - actual);
  } else {
    // Earn 1€ per HP damage dealt to an opponent
    if (attacker) attacker.money += actual;
    if (attacker?.bot) {
      attacker.bot.lastHitFrame = frameCount;
      attacker.bot.hasConfirmedHit = true;
    }
  }

  if (target.hp <= 0) {
    target.hp = 0;
    killPlayer(target, attackerId != null ? attackerId : targetId);
  }

  updateHUD();
}

function killPlayer(player, killerId) {
  player.alive   = false;
  player.canShoot = false;

  // Kill bonus for attacker
  if (killerId !== player.id) {
    const killer = players[killerId];
    if (killer) killer.money += 200;
  }

  // Death explosion: damages nearby players
  explode(player.id, player.gx, player.gy + TANK_H_CELLS / 2, 22, 120);

  // Visual flash
  explosionFx.push({
    gx: player.gx, gy: player.gy + TANK_H_CELLS / 2,
    r: 0, maxR: 80, t: 1.0, color: '#ffaa00',
  });

  updateHUD();
  checkRoundEnd();
}

function checkRoundEnd() {
  const alive = players.filter(p => p.alive);
  if (alive.length <= 1 && players.length > 1) {
    setTimeout(() => endRound(alive[0] || null), 1200);
  }
}

function onProjectileResolved(ownerId) {
  const p = players[ownerId];
  if (p) p.canShoot = true;
}

// ══════════════════════════════════════════════════════════════
//  ACID PARTICLE DAMAGE
// ══════════════════════════════════════════════════════════════
function updateAcidDamage() {
  for (const p of players) {
    if (!p.alive) continue;
    let hit = false;
    // Check cells around tank footprint for acid
    for (let dy = 0; dy <= TANK_H_CELLS + 1 && !hit; dy++) {
      for (let dx = -1; dx <= TANK_W_CELLS + 1 && !hit; dx++) {
        const gx = p.gx - Math.floor(TANK_W_CELLS / 2) + dx;
        const gy = p.gy + dy;
        if (getCell(gx, gy) === ACID) {
          if (p.shieldUntilFrame > frameCount) {
            setCell(gx, gy, EMPTY);
            hit = true;
            continue;
          }
          // Neutral environmental damage – acid burns, no money penalty
          dealDamage(null, p.id, ACID_DAMAGE);
          setCell(gx, gy, EMPTY); // particle is consumed on contact
          hit = true;
        }
      }
    }
  }
}

function activateShield(player) {
  player.shieldUntilFrame = frameCount + SHIELD_DURATION_FRAMES;
  const cx = player.gx;
  const cy = player.gy + Math.floor(TANK_H_CELLS / 2);
  const r2 = SHIELD_ACID_CLEAR_RADIUS * SHIELD_ACID_CLEAR_RADIUS;
  for (let y = Math.max(0, cy - SHIELD_ACID_CLEAR_RADIUS); y <= Math.min(GRID_H - 1, cy + SHIELD_ACID_CLEAR_RADIUS); y++) {
    for (let x = Math.max(0, cx - SHIELD_ACID_CLEAR_RADIUS); x <= Math.min(GRID_W - 1, cx + SHIELD_ACID_CLEAR_RADIUS); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2 && terrain[idx(x, y)] === ACID) {
        terrain[idx(x, y)] = EMPTY;
        terrainDirty = true;
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  INPUT HANDLING
// ══════════════════════════════════════════════════════════════
const PLAYER_KEYS = [
  // Player 1: ←/→ + Enter + ↑/↓
  { left:'ArrowLeft', right:'ArrowRight', fire:'Enter', prevWeapon:'ArrowUp', nextWeapon:'ArrowDown' },
  // Player 2: A/D + Space + W/S
  { left:'KeyA', right:'KeyD', fire:'Space', prevWeapon:'KeyW', nextWeapon:'KeyS' },
  // Player 3: J/L + U + I/K
  { left:'KeyJ', right:'KeyL', fire:'KeyU', prevWeapon:'KeyI', nextWeapon:'KeyK' },
  // Player 4: F/H + T + R/G
  { left:'KeyF', right:'KeyH', fire:'KeyT', prevWeapon:'KeyR', nextWeapon:'KeyG' },
  // Player 5: Numpad4/6 + Numpad0 + Numpad7/8
  { left:'Numpad4', right:'Numpad6', fire:'Numpad0', prevWeapon:'Numpad7', nextWeapon:'Numpad8' },
  // Player 6: V/N + B + C/M
  { left:'KeyV', right:'KeyN', fire:'KeyB', prevWeapon:'KeyC', nextWeapon:'KeyM' },
];

document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code))
    e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

function isMobileDevice() {
  return window.matchMedia('(pointer: coarse)').matches
    || /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
}

function bindTouchControlButton(btn) {
  if (!btn) return;

  const keyCode = btn.dataset.key;
  const isTapOnly = btn.dataset.tap === 'true';
  let tapReleaseTimer = null;

  const press = (e) => {
    e.preventDefault();
    keys[keyCode] = true;
    if (isTapOnly) {
      if (tapReleaseTimer) clearTimeout(tapReleaseTimer);
      tapReleaseTimer = setTimeout(() => {
        keys[keyCode] = false;
        tapReleaseTimer = null;
      }, 90);
    }
  };

  const release = (e) => {
    e.preventDefault();
    if (tapReleaseTimer) {
      clearTimeout(tapReleaseTimer);
      tapReleaseTimer = null;
    }
    keys[keyCode] = false;
  };

  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release);
}

function initTouchControls() {
  if (!DOM.touchControls) return;

  touchControlsEnabled = isMobileDevice();
  if (!touchControlsEnabled) {
    DOM.touchControls.classList.add('hidden');
    if (DOM.controlsHelp) DOM.controlsHelp.classList.remove('hidden');
    return;
  }

  DOM.touchControls.classList.remove('hidden');
  if (DOM.controlsHelp) DOM.controlsHelp.classList.add('hidden');
  const buttons = DOM.touchControls.querySelectorAll('[data-key]');
  buttons.forEach(bindTouchControlButton);
  updateTouchWeaponToggleLabel();
}

function getPrimaryLocalPlayer() {
  if (!players || players.length === 0 || myPlayerIndices.length === 0) return null;
  const playerId = myPlayerIndices[0];
  return players[playerId] || null;
}

function updateTouchWeaponToggleLabel() {
  if (!touchControlsEnabled || !DOM.touchWeaponToggle) return;
  const p = getPrimaryLocalPlayer();
  if (!p) {
    DOM.touchWeaponToggle.textContent = 'Weapon Toggle · --';
    return;
  }

  const wk = p.currentWeaponKey;
  const w = WEAPONS[wk];
  DOM.touchWeaponToggle.textContent = `Weapon Toggle · ${w.icon} ${w.name}`;
}

function processInput() {
  if (phase !== 'playing') return;

  for (const player of players) {
    if (!player.alive) continue;
    if (!player.isLocallyControlled()) continue;

    const localIdx = myPlayerIndices.indexOf(player.id);
    if (localIdx < 0 || localIdx >= PLAYER_KEYS.length) continue;
    const binds = PLAYER_KEYS[localIdx];

    // Rotate cannon
    const oldAngle = player.angle;
    if (keys[binds.left])  player.angle = Math.min(175, player.angle + ANGLE_SPEED);
    if (keys[binds.right]) player.angle = Math.max(5,   player.angle - ANGLE_SPEED);
    if (isOnline && player.angle !== oldAngle) {
      socket.emit('gameEvent', { type: 'angleChange', playerId: player.id, angle: player.angle });
    }

    // Cycle weapon
    if (justPressed(binds.prevWeapon)) cycleWeapon(player, -1);
    if (justPressed(binds.nextWeapon)) cycleWeapon(player,  1);

    // Charge / fire
    if (player.canShoot) {
      const wDef = WEAPONS[player.currentWeaponKey];
      if (wDef.type === 'laser' || player.currentWeaponKey === 'gunshot') {
        if (justPressed(binds.fire)) {
          player.charging = false;
          player.power = MAX_POWER;
          shootPlayer(player);
          player.power = 0;
        }
      } else {
        if (keys[binds.fire]) {
          player.charging = true;
          player.power = Math.min(MAX_POWER, player.power + CHARGE_RATE);
        } else if (player.charging) {
          // Release → shoot
          player.charging = false;
          shootPlayer(player);
          player.power = 0;
        }
      }
    }
  }

  // Save prev state
  Object.assign(prevKeys, keys);
}

function justPressed(code) {
  return keys[code] && !prevKeys[code];
}

function cycleWeapon(player, dir) {
  const n = WEAPON_ORDER.length;
  let i = ((player.weaponIdx + dir) % n + n) % n;
  // Skip weapons with 0 ammo (except cannonball = unlimited)
  let tries = n;
  while (tries-- > 0) {
    const wk = WEAPON_ORDER[i];
    if (wk === 'cannonball' || player.weapons[wk] > 0) break;
    i = ((i + dir) % n + n) % n;
  }
  player.weaponIdx = i;
  updateHUD();
}

function shootPlayer(player, fromRemote = false) {
  if (!player.canShoot) return;
  const wk  = player.currentWeaponKey;
  const def = WEAPONS[wk];

  if (!fromRemote && isOnline && !isHost) {
    // Client-controlled player asks host to execute the authoritative shot
    player.canShoot = false;
    socket.emit('gameEvent', {
      type: 'shootRequest',
      playerId: player.id,
      weaponKey: wk,
      angle: player.angle,
      power: player.power,
    });
    return;
  }

  // Check ammo
  if (!def.unlimited && player.weapons[wk] <= 0) {
    // Auto-fall back to cannonball
    player.weaponIdx = 0;
    return;
  }
  // Consume ammo
  if (!def.unlimited) {
    player.weapons[wk]--;
    if (player.weapons[wk] <= 0) cycleWeapon(player, 1);
  }

  player.canShoot = false;

  if (def.type === 'shield') {
    activateShield(player);
    onProjectileResolved(player.id);
  } else if (def.type === 'laser') {
    fireLaser(player);
    // Laser resolves instantly
    onProjectileResolved(player.id);

  } else {
    const tip = player.cannonTip();
    const rad = (player.angle * Math.PI) / 180;
    const spd = player.power * def.powerScale;
    const vx  = spd * Math.cos(rad);
    const vy  = -spd * Math.sin(rad);
    projectiles.push(new Projectile(player.id, tip.x, tip.y, vx, vy, wk));
  }

  // Broadcast if online host
  if (isOnline && isHost) {
    socket.emit('gameEvent', {
      type: 'shoot', playerId: player.id, weaponKey: wk,
      angle: player.angle, power: player.power,
    });
  }

  updateHUD();
}

// ══════════════════════════════════════════════════════════════
//  RENDERING
// ══════════════════════════════════════════════════════════════
function renderTerrain() {
  if (!terrain) return;
  if (terrainDirty) rebuildTerrainImage();
  ctx.drawImage(terrainCanvas, 0, 0);
}

function renderPlayers() {
  for (const p of players) {
    const sx = p.gx * SCALE;                     // screen centre x
    const sy = (p.gy + TANK_H_CELLS / 2) * SCALE; // screen centre y
    const bx = (p.gx - TANK_W_CELLS / 2) * SCALE;
    const by = p.gy * SCALE;
    const bw = TANK_W_CELLS * SCALE;
    const bh = TANK_H_CELLS * SCALE;

    if (!p.alive) {
      // Draw wreckage
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#333';
      ctx.fillRect(bx, by, bw, bh);
      ctx.globalAlpha = 1;
      continue;
    }

    // Body shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(bx + 3, by + 3, bw, bh);

    // Body
    ctx.fillStyle = p.color;
    ctx.fillRect(bx, by, bw, bh);
    // Highlight strip
    ctx.fillStyle = p.colorHi;
    ctx.fillRect(bx, by, bw, 4);
    // Dark border
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bw, bh);

    // Cannon
    const rad = (p.angle * Math.PI) / 180;
    const cx = sx, cy = sy - SCALE;
    const ex = cx + CANNON_LEN * SCALE * Math.cos(rad);
    const ey = cy - CANNON_LEN * SCALE * Math.sin(rad);

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();

    // HP bar over tank
    const hpFrac = p.hp / p.maxHp;
    const barW = bw;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by - 6, barW, 4);
    ctx.fillStyle = hpFrac > 0.5 ? '#4caf50' : hpFrac > 0.25 ? '#f0c040' : '#f44336';
    ctx.fillRect(bx, by - 6, Math.round(barW * hpFrac), 4);

    // Name label
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = 'bold 10px monospace';
    const tw = ctx.measureText(p.name).width;
    ctx.fillText(p.name, sx - tw/2, by - 10);
    ctx.fillStyle = p.color;
    ctx.fillText(p.name, sx - tw/2 - 0.5, by - 10.5);

    // Weapon + ammo on tank
    const wk = p.currentWeaponKey;
    const ammo = p.weapons[wk] === Infinity ? '∞' : p.weapons[wk];
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(`${WEAPONS[wk].icon}${ammo}`, bx + 2, by + bh + 10);

    // Power charge bar on tank while charging
    if (p.charging) {
      const pw = Math.round((p.power / MAX_POWER) * bw);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, by + bh + 12, bw, 3);
      ctx.fillStyle = '#f0c040';
      ctx.fillRect(bx, by + bh + 12, pw, 3);
    }

    if (p.shieldUntilFrame > frameCount) {
      ctx.save();
      const radius = Math.max(bw, bh) * 0.95;
      const alpha = 0.35 + 0.2 * Math.sin(frameCount * 0.25);
      ctx.strokeStyle = `rgba(120,200,255,${alpha.toFixed(2)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function renderProjectiles() {
  for (const proj of projectiles) {
    if (!proj.alive) continue;

    // Trail
    if (proj.trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = proj.weaponKey === 'rocket' ? '#ff8800' : '#ffdd88';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      const first = proj.trail[0];
      ctx.moveTo(first.x * SCALE, first.y * SCALE);
      for (let i = 1; i < proj.trail.length; i++) {
        const t = proj.trail[i];
        ctx.lineTo(t.x * SCALE, t.y * SCALE);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Projectile dot
    const sx = proj.x * SCALE, sy = proj.y * SCALE;
    ctx.fillStyle = proj.weaponKey === 'rocket' ? '#ff4400' : '#ffee00';
    ctx.beginPath();
    ctx.arc(sx, sy, PROJECTILE_R + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx, sy, PROJECTILE_R - 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderLaserBeams() {
  for (const beam of laserBeams) {
    if (beam.t <= 0) continue;
    ctx.save();
    ctx.globalAlpha = beam.t;
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(beam.x1 * SCALE, beam.y1 * SCALE);
    ctx.lineTo(beam.x2 * SCALE, beam.y2 * SCALE);
    ctx.stroke();
    ctx.restore();
  }
}

function renderExplosions() {
  for (const fx of explosionFx) {
    if (fx.t <= 0) continue;
    ctx.save();
    ctx.globalAlpha = fx.t * 0.8;
    const gradient = ctx.createRadialGradient(
      fx.gx * SCALE, fx.gy * SCALE, 0,
      fx.gx * SCALE, fx.gy * SCALE, fx.r);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(0.3, fx.color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(fx.gx * SCALE, fx.gy * SCALE, fx.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function renderPowerBar() {
  const charging = players.some(p => p.alive && p.isLocallyControlled() && p.charging);
  const power    = players.reduce((m, p) =>
    (p.alive && p.isLocallyControlled() && p.charging) ? Math.max(m, p.power) : m, 0);

  if (charging) {
    DOM.powerBarContainer.classList.remove('hidden');
    DOM.powerBarFill.style.width = `${(power / MAX_POWER) * 100}%`;
  } else {
    DOM.powerBarContainer.classList.add('hidden');
  }
}

// ══════════════════════════════════════════════════════════════
//  HUD
// ══════════════════════════════════════════════════════════════
function buildHUD() {
  DOM.hud.innerHTML = '';
  for (const p of players) {
    const div = document.createElement('div');
    div.className = 'player-panel' + (p.alive ? '' : ' dead');
    div.id = `panel-${p.id}`;
    div.innerHTML = `
      <div class="pname" style="color:${p.color}">${p.name}</div>
      <div class="hp-bar-bg"><div class="hp-bar-fill" id="hpbar-${p.id}"
           style="width:100%;background:${p.color}"></div></div>
      <div class="player-stats">
        <span id="hp-${p.id}">❤️ ${p.hp}</span>
        <span id="money-${p.id}">💰 ${p.money}€</span>
        <span id="angle-${p.id}">📐 ${Math.round(p.angle)}°</span>
        <span class="weapon-tag" id="wpn-${p.id}">${WEAPONS[p.currentWeaponKey].icon} ${WEAPONS[p.currentWeaponKey].name}</span>
      </div>`;
    DOM.hud.appendChild(div);
  }
}

function updateHUD() {
  for (const p of players) {
    const panel = document.getElementById(`panel-${p.id}`);
    if (!panel) continue;
    panel.classList.toggle('dead', !p.alive);
    panel.classList.toggle('active', p.alive && p.isLocallyControlled());

    const hpBar   = document.getElementById(`hpbar-${p.id}`);
    const hpSpan  = document.getElementById(`hp-${p.id}`);
    const monSpan = document.getElementById(`money-${p.id}`);
    const wpnSpan = document.getElementById(`wpn-${p.id}`);
    const angSpan = document.getElementById(`angle-${p.id}`);

    if (hpBar)  hpBar.style.width   = `${(p.hp / p.maxHp) * 100}%`;
    if (hpSpan) hpSpan.textContent  = `❤️ ${p.hp}`;
    if (monSpan)monSpan.textContent = `💰 ${p.money}€`;
    if (angSpan)angSpan.textContent = `📐 ${Math.round(p.angle)}°`;
    if (wpnSpan) {
      const wk   = p.currentWeaponKey;
      const ammo = p.weapons[wk] === Infinity ? '∞' : p.weapons[wk];
      wpnSpan.textContent = `${WEAPONS[wk].icon} ${WEAPONS[wk].name} ×${ammo}`;
    }
    if (p.shieldUntilFrame > frameCount) {
      panel.classList.add('active');
    }
  }

  updateTouchWeaponToggleLabel();
}

// ══════════════════════════════════════════════════════════════
//  SHOP
// ══════════════════════════════════════════════════════════════
function openShop(playerIdx) {
  let idx = playerIdx;
  while (idx < players.length && players[idx]?.bot) {
    runBotShop(players[idx]);
    idx++;
  }

  if (idx >= players.length) {
    closeShop();
    startRound();
    return;
  }

  shopPlayerIdx = idx;
  const p = players[idx];
  if (!p) { closeShop(); return; }

  DOM.shopBalanceText.textContent = `Player: ${p.name}  |  Balance: ${p.money}€`;
  const container = DOM.shopItems;
  container.innerHTML = '';

  for (const wk of WEAPON_ORDER) {
    if (wk === 'cannonball') continue; // always unlimited, no purchase
    const w = WEAPONS[wk];
    const div = document.createElement('div');
    div.className = 'shop-item';
    div.innerHTML = `
      <div class="item-name">${w.icon} ${w.name}</div>
      <div class="item-desc">${w.desc}</div>
      <div class="item-price">${w.cost}€ each</div>
      <div class="item-owned" id="owned-${wk}">Owned: ${p.weapons[wk]}</div>
      <button class="btn btn-secondary btn-sm" id="buy-${wk}">Buy (${w.cost}€)</button>`;
    container.appendChild(div);

    const btn = document.getElementById(`buy-${wk}`);
    btn.onclick = () => {
      if (p.money >= w.cost) {
        p.money -= w.cost;
        p.weapons[wk]++;
        document.getElementById(`owned-${wk}`).textContent = `Owned: ${p.weapons[wk]}`;
        DOM.shopBalanceText.textContent = `Player: ${p.name}  |  Balance: ${p.money}€`;
        updateHUD();
      }
    };
  }

  DOM.shopModal.classList.remove('hidden');

  // "Done" advances to next player or closes shop
  DOM.btnShopDone.onclick = () => {
    const nextIdx = shopPlayerIdx + 1;
    openShop(nextIdx);
  };
}

function closeShop() {
  DOM.shopModal.classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════
//  ROUND MANAGEMENT
// ══════════════════════════════════════════════════════════════
function startRound() {
  roundNum++;
  phase = 'playing';
  projectiles = [];
  laserBeams  = [];
  explosionFx = [];
  acidPending = [];

  const seed = Math.floor(Math.random() * 0xFFFFFF);
  generateTerrain(seed);

  // Respawn players
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    p.hp       = p.maxHp;
    p.alive    = true;
    p.canShoot = true;
    p.charging = false;
    p.power    = 0;
    p.weaponIdx = 0;
    if (unlimitedAmmoMode) {
      for (const wk of WEAPON_ORDER) p.weapons[wk] = Infinity;
    }
    // Place evenly
    p.gx = Math.floor(GRID_W * (i + 1) / (players.length + 1));
    p.snapToTerrain();
  }

  updateHUD();
  showBanner(`Round ${roundNum}`, 1800);

    if (isOnline && isHost) {
      socket.emit('gameEvent', { type: 'roundStart', roundNum, seed });
    }
}

function endRound(winner) {
  phase = 'roundEnd';
  const msg = winner
    ? `${winner.name} wins Round ${roundNum}! 🏆`
    : 'Draw! No survivors.';

  showBanner(msg, 3000);
  setTimeout(() => openShop(0), 3200);
}

// ══════════════════════════════════════════════════════════════
//  BANNERS & MESSAGES
// ══════════════════════════════════════════════════════════════
function showBanner(text, duration) {
  DOM.roundBanner.textContent = text;
  DOM.roundBanner.classList.remove('hidden');
  setTimeout(() => DOM.roundBanner.classList.add('hidden'), duration);
}

// ══════════════════════════════════════════════════════════════
//  GAME LOOP
// ══════════════════════════════════════════════════════════════
function update() {
  frameCount++;
  processInput();

  if (phase !== 'playing') return;

  // Update projectiles
  for (const proj of projectiles) proj.update();
  projectiles = projectiles.filter(p => p.alive);

  // Sand physics (every frame)
  if (frameCount % SAND_EVERY === 0) updateSandPhysics();

  if (isOnline && isHost && frameCount % 2 === 0 && terrainSyncShadow) {
    const diffs = [];
    for (let i = 0; i < terrain.length; i++) {
      if (terrain[i] !== terrainSyncShadow[i]) {
        diffs.push([i, terrain[i]]);
        terrainSyncShadow[i] = terrain[i];
      }
    }
    if (diffs.length > 0) socket.emit('terrainDiff', diffs);
  }

  // Re-snap players to terrain (tanks sit on top)
  for (const p of players) {
    if (p.alive) p.snapToTerrain();
  }

  updateBots();

  // Acid damage
  if (frameCount % 4 === 0) updateAcidDamage();

  // Refresh angle displays every 6 frames (smooth enough without being noisy)
  if (frameCount % 6 === 0 && phase === 'playing') updateHUD();

  // Fade FX
  for (const beam of laserBeams)   beam.t -= 0.04;
  for (const fx of explosionFx) {
    fx.t -= 0.04;
    fx.r  = Math.min(fx.maxR, fx.r + fx.maxR * 0.08);
  }
  laserBeams  = laserBeams.filter(b => b.t > 0);
  explosionFx = explosionFx.filter(f => f.t > 0);
}

function getAliveOpponents(botPlayer) {
  return players.filter(p =>
    p.id !== botPlayer.id &&
    p.alive &&
    p.hp > 0,
  );
}

function pickNearestTarget(botPlayer) {
  const opponents = getAliveOpponents(botPlayer);
  if (opponents.length === 0) return null;
  const cy = botPlayer.gy + TANK_H_CELLS / 2;
  return opponents.reduce((best, p) => {
    const py = p.gy + TANK_H_CELLS / 2;
    const bd = Math.hypot(best.gx - botPlayer.gx, (best.gy + TANK_H_CELLS / 2) - cy);
    const pd = Math.hypot(p.gx - botPlayer.gx, py - cy);
    return pd < bd ? p : best;
  }, opponents[0]);
}

function pickNextAliveTarget(botPlayer, lastTargetId) {
  const opponents = getAliveOpponents(botPlayer);
  if (opponents.length === 0) return null;
  if (lastTargetId === undefined || lastTargetId === null) return opponents[0];

  const sorted = opponents.slice().sort((a, b) => a.id - b.id);
  const idx = sorted.findIndex(p => p.id === lastTargetId);
  if (idx < 0) return sorted[0];
  return sorted[(idx + 1) % sorted.length];
}

function pickTarget(botPlayer, mode, state = null) {
  const opponents = getAliveOpponents(botPlayer);
  if (opponents.length === 0) return null;
  if (mode === 'easy') {
    return opponents[Math.floor(Math.random() * opponents.length)];
  }
  if (mode === 'god' && state) {
    const missedLastShot = state.lastShotFrame > state.lastHitFrame
      && (frameCount - state.lastShotFrame) >= GOD_REFOCUS_FRAMES;
    if (missedLastShot) {
      return pickNextAliveTarget(botPlayer, state.lastTargetId);
    }
  }
  if (mode === 'medium' || mode === 'hard' || mode === 'expert' || mode === 'god') {
    return pickNearestTarget(botPlayer);
  }
  return opponents[0];
}

function clamp(min, v, max) {
  return Math.max(min, Math.min(max, v));
}

function solveBallisticShot(botPlayer, target, weaponKey) {
  const def = WEAPONS[weaponKey] || WEAPONS.cannonball;
  const g = def.gravity;
  const sx = botPlayer.gx;
  const sy = botPlayer.gy + TANK_H_CELLS / 2;
  const tx = target.gx;
  const ty = target.gy + TANK_H_CELLS / 2;
  const x = target.gx - botPlayer.gx;
  const y = sy - ty;
  const absX = Math.abs(x);

  // If target is almost vertical, use a high arc with moderate power.
  if (absX < 1.2) {
    return {
      angle: y >= 0 ? 90 : 82,
      power: clamp(7, 10.5, MAX_POWER),
    };
  }

  // Brute-force from low to high speed to get near-minimum power perfect-ish shots.
  const maxSpeed = MAX_POWER * def.powerScale;
  for (let v = 6.5 * def.powerScale; v <= maxSpeed; v += 0.2) {
    if (g <= 0) {
      const dy = (target.gy + TANK_H_CELLS / 2) - (botPlayer.gy + TANK_H_CELLS / 2);
      const angleDirect = Math.atan2(-dy, x) * 180 / Math.PI;
      const norm = angleDirect < 0 ? angleDirect + 180 : angleDirect;
      return { angle: clamp(5, norm, 175), power: clamp(6, v / def.powerScale, MAX_POWER) };
    }

    const vv = v * v;
    const disc = vv * vv - g * (g * absX * absX + 2 * y * vv);
    if (disc < 0) continue;
    const sqrtD = Math.sqrt(disc);

    // Prefer lower arc for faster, flatter, and more stable god shots.
    const tanTheta = (vv - sqrtD) / (g * absX);
    if (!Number.isFinite(tanTheta)) continue;

    let theta = Math.atan(tanTheta) * 180 / Math.PI; // 0..90
    if (!Number.isFinite(theta)) continue;
    theta = clamp(5, theta, 85);

    const angle = x >= 0 ? theta : (180 - theta);
    return {
      angle: clamp(5, angle, 175),
      power: clamp(6, v / def.powerScale, MAX_POWER),
    };
  }

  // Numerical fallback: search for the best trajectory toward current target.
  let best = {
    err: Infinity,
    angle: x >= 0 ? 45 : 135,
    power: clamp(6, MAX_POWER * 0.75, MAX_POWER),
  };

  for (let power = 6; power <= MAX_POWER; power += 0.35) {
    const v = power * def.powerScale;
    for (let angle = 8; angle <= 172; angle += 1.5) {
      if (x >= 0 && angle >= 90) continue;
      if (x < 0 && angle <= 90) continue;

      const rad = angle * Math.PI / 180;
      const vx = v * Math.cos(rad);
      const vy = -v * Math.sin(rad);
      if (Math.abs(vx) < 0.001) continue;

      const t = (tx - sx) / vx;
      if (t <= 0) continue;

      const yAt = sy + vy * t + 0.5 * g * t * t;
      const err = Math.abs(yAt - ty);
      if (err < best.err) {
        best = { err, angle, power };
      }
      if (err <= 0.6) {
        return {
          angle: clamp(5, angle, 175),
          power: clamp(6, power, MAX_POWER),
        };
      }
    }
  }

  return {
    angle: clamp(5, best.angle, 175),
    power: clamp(6, best.power, MAX_POWER),
  };
}

function chooseBotWeapon(botPlayer, state) {
  const mode = state.mode;
  if (mode === 'easy') return 'cannonball';

  if (mode === 'medium') {
    const occasionalSpecial = Math.random() < 0.22;
    if (occasionalSpecial) {
      const available = WEAPON_ORDER.filter(wk => wk !== 'cannonball' && botPlayer.weapons[wk] > 0);
      if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
    }
    return 'cannonball';
  }

  if (mode === 'hard' || mode === 'expert') {
    if (state.hasConfirmedHit && botPlayer.weapons.rocket > 0) return 'rocket';
    return 'cannonball';
  }

  if (mode === 'god') {
    if (botPlayer.weapons.rocket > 0) return 'rocket';
    return 'cannonball';
  }

  return 'cannonball';
}

function estimateBotAim(botPlayer, target, state, weaponKey) {
  const botCy = botPlayer.gy + TANK_H_CELLS / 2;
  const targetCy = target.gy + TANK_H_CELLS / 2;
  const dx = target.gx - botPlayer.gx;
  const absDx = Math.abs(dx);

  if (state.mode === 'easy') {
    return {
      angle: clamp(5, 20 + Math.random() * 155, 175),
      power: clamp(6, 6 + Math.random() * (MAX_POWER - 6), MAX_POWER),
    };
  }

  if (state.mode === 'god') {
    return solveBallisticShot(botPlayer, target, weaponKey);
  }

  // Point toward target then blend toward an arc (90°) for ballistic flight.
  const direct = Math.atan2(botCy - targetCy, dx || 1) * 180 / Math.PI;
  const arcLiftFactor = clamp(0.28, absDx / GRID_W + 0.25, 0.78);
  let angle = direct + (90 - direct) * arcLiftFactor;
  let power = clamp(7, 8 + absDx * 0.045 + Math.max(0, botCy - targetCy) * 0.03, MAX_POWER);

  const variance = BOT_AIM_VARIANCE[state.mode] ?? 0;
  angle += state.angleBias + (Math.random() * 2 - 1) * variance;
  power += state.powerBias + (Math.random() * 2 - 1) * variance * 0.22;

  if (weaponKey === 'rocket' && (state.mode === 'hard' || state.mode === 'expert' || state.mode === 'god')) {
    power += 1.6; // stronger follow-up shot once hard bot locks on
  }

  return {
    angle: clamp(5, angle, 175),
    power: clamp(6, power, MAX_POWER),
  };
}

function updateBotLearning(botPlayer, target, shot) {
  const state = botPlayer.bot;
  if (!state || !target) return;
  if (state.mode === 'easy' || state.mode === 'god') return;

  const dx = target.gx - botPlayer.gx;
  const distanceFactor = clamp(0.6, Math.abs(dx) / 180, 2.2);
  const missDirection = Math.random() < 0.5 ? -1 : 1;

  // Nudge toward target over multiple shots but keep enough noise to miss often on medium.
  const biasNudge = state.mode === 'hard' || state.mode === 'expert' ? 0.35 : 0.18;
  state.angleBias += (dx > 0 ? -1 : 1) * missDirection * biasNudge;
  state.powerBias += (dx > 0 ? 1 : -1) * biasNudge * 0.25 * distanceFactor;

  if (state.lastHitFrame && frameCount - state.lastHitFrame < 90) {
    state.angleBias *= 0.5;
    state.powerBias *= 0.65;
  } else {
    const decay = state.mode === 'hard' || state.mode === 'expert' ? 0.9 : 0.8;
    state.angleBias *= decay;
    state.powerBias *= decay;
  }
}

function runBotShop(botPlayer) {
  if (!botPlayer?.bot || unlimitedAmmoMode) return;
  const mode = botPlayer.bot.mode;

  if (mode === 'easy') {
    botPlayer.weaponIdx = 0;
    return;
  }

  if (mode === 'medium') {
    const purchasable = WEAPON_ORDER.filter(wk => wk !== 'cannonball' && wk !== 'shield');
    let budget = botPlayer.money;
    let tries = 8;
    while (tries-- > 0 && budget >= 10) {
      const wk = purchasable[Math.floor(Math.random() * purchasable.length)];
      const w = WEAPONS[wk];
      if (budget < w.cost) continue;
      if (Math.random() < 0.45) continue;
      botPlayer.weapons[wk]++;
      budget -= w.cost;
    }
    botPlayer.money = budget;
    return;
  }

  if (mode === 'hard' || mode === 'expert' || mode === 'god') {
    const rocketCost = WEAPONS.rocket.cost;
    while (botPlayer.money >= rocketCost) {
      botPlayer.weapons.rocket++;
      botPlayer.money -= rocketCost;
      if (mode === 'hard' && botPlayer.weapons.rocket >= 12) break;
      if (mode === 'expert' && botPlayer.weapons.rocket >= 18) break;
    }
  }
}

function fireBot(botPlayer) {
  const state = botPlayer.bot;
  if (!state || !botPlayer.canShoot || !botPlayer.alive) return;
  let target = pickTarget(botPlayer, state.mode, state);
  if (!target || !target.alive || target.hp <= 0) {
    const fallback = getAliveOpponents(botPlayer);
    if (fallback.length === 0) return;
    target = fallback[0];
  }

  const wk = chooseBotWeapon(botPlayer, state);
  botPlayer.weaponIdx = Math.max(0, WEAPON_ORDER.indexOf(wk));
  const shot = estimateBotAim(botPlayer, target, state, wk);
  botPlayer.angle = shot.angle;
  botPlayer.power = shot.power;

  if (wk === 'laser' || wk === 'gunshot') {
    botPlayer.power = MAX_POWER;
  }

  shootPlayer(botPlayer);
  state.lastShotFrame = frameCount;
  state.lastTargetId = target.id;
  updateBotLearning(botPlayer, target, shot);

  const cadenceByMode = {
    easy: [120, 240],
    medium: [90, 170],
    hard: [55, 110],
    expert: [35, 70],
    god: [16, 28],
  };
  const [lo, hi] = cadenceByMode[state.mode] || [110, 180];
  state.nextFireFrame = frameCount + lo + Math.floor(Math.random() * Math.max(1, hi - lo));
}

function updateBots() {
  if (phase !== 'playing') return;
  for (const p of players) {
    if (!p.bot || !p.alive) continue;
    if (frameCount >= p.bot.nextFireFrame) fireBot(p);
  }
}

function render() {
  ctx.clearRect(0, 0, CW, CH);
  renderTerrain();
  renderExplosions();
  renderLaserBeams();
  renderProjectiles();
  renderPlayers();
  renderPowerBar();
}

function gameLoop(now = 0) {
  if (!gameLoopLastTime) gameLoopLastTime = now;

  let deltaMs = now - gameLoopLastTime;
  gameLoopLastTime = now;

  // Avoid huge catch-up bursts after tab switches or frame stalls.
  if (deltaMs > 250) deltaMs = GAME_LOOP_STEP_MS;
  gameLoopAccumulator += deltaMs;

  let steps = 0;
  while (gameLoopAccumulator >= GAME_LOOP_STEP_MS && steps < GAME_LOOP_MAX_CATCHUP_STEPS) {
    update();
    gameLoopAccumulator -= GAME_LOOP_STEP_MS;
    steps++;
  }

  if (steps > 0) render();
  requestAnimationFrame(gameLoop);
}

// ══════════════════════════════════════════════════════════════
//  NETWORK (Socket.io)
// ══════════════════════════════════════════════════════════════
function initSocket() {
  if (!onlineMultiplayerAvailable || typeof window.io !== 'function') {
    setRoomStatus('Online multiplayer unavailable in static mode.', 'err');
    return false;
  }

  socket = io();

  socket.on('playerJoined', ({ players: list }) => {
    updateRoomPlayerList(list);
  });

  socket.on('playerLeft', () => {
    showBanner('A player disconnected', 2000);
  });

  socket.on('gameStart', ({ seed, playerData, unlimitedAmmoMode: serverUnlimitedAmmoMode }) => {
    unlimitedAmmoMode = !!serverUnlimitedAmmoMode;
    startOnlineGame(seed, playerData);
  });

  socket.on('gameEvent', evt => {
    handleRemoteEvent(evt);
  });

  socket.on('terrainDiff', diffs => {
    for (const [i, v] of diffs) {
      terrain[i] = v;
    }
    terrainDirty = true;
  });

  return true;
}

function handleRemoteEvent(evt) {
  switch (evt.type) {
    case 'angleChange': {
      const p = players[evt.playerId];
      if (p) p.angle = evt.angle;
      break;
    }
    case 'shootRequest': {
      if (!isHost) break;
      const p = players[evt.playerId];
      if (!p || !p.alive) break;
      p.angle = evt.angle;
      p.power = evt.power;
      p.canShoot = true;
      p.weaponIdx = Math.max(0, WEAPON_ORDER.indexOf(evt.weaponKey));
      shootPlayer(p, true);
      break;
    }
    case 'shoot': {
      const p = players[evt.playerId];
      if (!p || !p.alive) break;
      p.angle = evt.angle;
      p.power = evt.power;
      p.canShoot = true;
      p.weaponIdx = Math.max(0, WEAPON_ORDER.indexOf(evt.weaponKey));
      if (isHost) break;
      shootPlayer(p, true);
      break;
    }
    case 'terrainDiff': {
      if (!evt.diffs) break;
      for (const [i, v] of evt.diffs) terrain[i] = v;
      terrainDirty = true;
      break;
    }
    case 'roundStart': {
      generateTerrain(evt.seed);
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        p.hp = p.maxHp; p.alive = true; p.canShoot = true;
        p.gx = Math.floor(GRID_W * (i + 1) / (players.length + 1));
        p.snapToTerrain();
      }
      phase = 'playing';
      roundNum = evt.roundNum;
      showBanner(`Round ${roundNum}`, 1800);
      break;
    }
  }
}

function updateRoomPlayerList(list) {
  DOM.roomPlayersList.innerHTML = list.map(p =>
    `<div>• ${p.name} ${p.isHost ? '(Host)':''}</div>`).join('');
  DOM.waitingPanel.classList.remove('hidden');
  // Show start button only for host
  DOM.btnStartOnline.style.display = isHost ? '' : 'none';
}

function startOnlineGame(seed, playerData) {
  DOM.lobby.classList.add('hidden');
  DOM.gameScreen.classList.remove('hidden');
  const myIds = [];
  let cursor = 0;
  for (const entry of (playerData || [])) {
    const count = Math.max(1, Math.min(2, entry.numLocalPlayers || 1));
    if (entry.idx === myConnectionIdx) {
      for (let i = 0; i < count; i++) myIds.push(cursor + i);
    }
    cursor += count;
  }
  myPlayerIndices = myIds;
  const list = (playerData || []).flatMap((entry) => {
    const count = Math.max(1, Math.min(2, entry.numLocalPlayers || 1));
    const res = [];
    for (let i = 0; i < count; i++) {
      const suffix = count > 1 ? ` ${i + 1}` : '';
      res.push({ name: `${entry.name}${suffix}` });
    }
    return res;
  });
  players = list.map((p, i) => new Player(i, p.name, 0, PLAYER_PALETTE[i % PLAYER_PALETTE.length]));
  buildHUD();
  startRoundWithSeed(seed);
}

function startRoundWithSeed(seed) {
  roundNum++;
  phase = 'playing';
  projectiles = [];
  laserBeams  = [];
  explosionFx = [];
  acidPending = [];
  generateTerrain(seed);

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    p.hp = p.maxHp;
    p.alive = true;
    p.canShoot = true;
    p.charging = false;
    p.power = 0;
    p.weaponIdx = 0;
    if (unlimitedAmmoMode) {
      for (const wk of WEAPON_ORDER) p.weapons[wk] = Infinity;
    }
    p.gx = Math.floor(GRID_W * (i + 1) / (players.length + 1));
    p.snapToTerrain();
  }

  updateHUD();
  showBanner(`Round ${roundNum}`, 1800);

  if (!isOnline) assignBotsFromNames();
}

function assignBotsFromNames() {
  bots = [];
  for (const p of players) {
    const m = /\[(easy|medium|hard|expert|god)\]/i.exec(p.name);
    if (!m) {
      p.bot = null;
      continue;
    }
    const mode = m[1].toLowerCase();
    p.bot = {
      mode,
      nextFireFrame: frameCount + 120 + Math.floor(Math.random() * 120),
      angleBias: 0,
      powerBias: 0,
      lastHitFrame: -99999,
      lastShotFrame: -99999,
      lastTargetId: null,
      hasConfirmedHit: false,
    };
    bots.push(p.id);
  }
}

// ══════════════════════════════════════════════════════════════
//  LOBBY / SETUP
// ══════════════════════════════════════════════════════════════
function setupPlayerNameFields() {
  const n = parseInt(DOM.numPlayers.value) || 6;
  const p_tpyes = ["", "s", " [easy]", " [medium]", " [hard]", " [god]"]
  DOM.playerNameFields.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const div = document.createElement('div');
    div.className = 'player-name-entry';
    div.innerHTML = `
      <label>Player ${i+1} Name</label>
      <input type="text" id="pname-${i}" value="Player ${i+1 +p_tpyes[i]}"  maxlength="14">`;
    DOM.playerNameFields.appendChild(div);
  }
}

function startLocalGame() {
  const n = Math.max(1, Math.min(6, parseInt(DOM.numPlayers.value) || 2));
  const names = [];
  for (let i = 0; i < n; i++) {
    const el = document.getElementById(`pname-${i}`);
    names.push(el ? el.value.trim() || `Player ${i+1}` : `Player ${i+1}`);
  }

  unlimitedAmmoMode = !!DOM.unlimitedAmmo?.checked;

  players = names.map((name, i) => {
    const p = new Player(i, name, 0, PLAYER_PALETTE[i % PLAYER_PALETTE.length]);
    if (unlimitedAmmoMode) {
      for (const wk of WEAPON_ORDER) p.weapons[wk] = Infinity;
    }
    return p;
  });

  myConnectionIdx = 0;
  myLocalCount = players.length;
  myPlayerIndices = players.map(p => p.id);
  isOnline = false;
  assignBotsFromNames();

  DOM.lobby.classList.add('hidden');
  DOM.gameScreen.classList.remove('hidden');

  buildHUD();
  startRound();
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
function cacheDOMRefs() {
  DOM.lobby           = document.getElementById('lobby');
  DOM.gameScreen      = document.getElementById('game-screen');
  DOM.hud             = document.getElementById('hud');
  DOM.numPlayers      = document.getElementById('num-players');
  DOM.playerNameFields= document.getElementById('player-name-fields');
  DOM.btnLocal        = document.getElementById('btn-local');
  DOM.shopModal       = document.getElementById('shop-modal');
  DOM.shopBalanceText = document.getElementById('shop-balance-text');
  DOM.shopItems       = document.getElementById('shop-items');
  DOM.btnShopDone     = document.getElementById('btn-shop-done');
  DOM.roundBanner     = document.getElementById('round-banner');
  DOM.powerBarContainer= document.getElementById('power-bar-container');
  DOM.powerBarFill    = document.getElementById('power-bar-fill');
  DOM.controlsHelp    = document.getElementById('controls-help');
  DOM.touchControls   = document.getElementById('touch-controls');
  DOM.touchWeaponToggle = document.getElementById('touch-weapon-toggle');
  DOM.onlineSection   = document.getElementById('online-section');
  DOM.onlineControls  = document.getElementById('online-controls');
  DOM.onlineUnavailableNote = document.getElementById('online-unavailable-note');
  DOM.onlineName      = document.getElementById('online-name');
  DOM.onlineLocal     = document.getElementById('online-local');
  DOM.btnCreate       = document.getElementById('btn-create');
  DOM.btnJoin         = document.getElementById('btn-join');
  DOM.roomCodeInput   = document.getElementById('room-code-input');
  DOM.roomStatus      = document.getElementById('room-status');
  DOM.waitingPanel    = document.getElementById('waiting-panel');
  DOM.roomPlayersList = document.getElementById('room-players-list');
  DOM.btnStartOnline  = document.getElementById('btn-start-online');
  DOM.unlimitedAmmo   = document.getElementById('unlimited-ammo');
}

function detectOnlineMultiplayerAvailability() {
  onlineMultiplayerAvailable = typeof window.io === 'function';

  if (!onlineMultiplayerAvailable) {
    if (DOM.onlineControls) DOM.onlineControls.classList.add('hidden');
    if (DOM.onlineUnavailableNote) {
      DOM.onlineUnavailableNote.textContent =
        'Online multiplayer is disabled because no realtime server is available in this deployment.';
      DOM.onlineUnavailableNote.classList.remove('hidden');
    }
  }
}

function bindLobbyEvents() {
  DOM.numPlayers.addEventListener('input', setupPlayerNameFields);
  DOM.btnLocal.addEventListener('click', startLocalGame);

  if (!onlineMultiplayerAvailable) return;

  DOM.btnCreate.addEventListener('click', () => {
    if (!socket && !initSocket()) return;
    const name = DOM.onlineName.value.trim() || 'Commander';
    const local = parseInt(DOM.onlineLocal.value) || 1;
    socket.emit('createRoom', { playerName: name, numLocalPlayers: local }, res => {
      if (res.ok) {
        isHost = true;
        roomCode = res.code;
        myConnectionIdx = res.idx;
        myLocalCount = local;
        myPlayerIndices = [];
        setRoomStatus(`Room created: ${res.code}  |  Waiting for players...`, 'ok');
        updateRoomPlayerList(res.players);
        DOM.btnStartOnline.style.display = '';
      } else {
        setRoomStatus('Error creating room', 'err');
      }
    });
  });

  DOM.btnJoin.addEventListener('click', () => {
    if (!socket && !initSocket()) return;
    const code  = DOM.roomCodeInput.value.trim().toUpperCase();
    const name  = DOM.onlineName.value.trim() || 'Commander';
    const local = parseInt(DOM.onlineLocal.value) || 1;
    if (!code) return;
    socket.emit('joinRoom', { code, playerName: name, numLocalPlayers: local }, res => {
      if (res.ok) {
        isHost = false;
        roomCode = code;
        myConnectionIdx = res.idx;
        myLocalCount = local;
        myPlayerIndices = [];
        setRoomStatus(`Joined room ${code}  |  Waiting for host to start...`, 'ok');
        updateRoomPlayerList(res.players);
      } else {
        setRoomStatus(`Error: ${res.err}`, 'err');
      }
    });
  });

  DOM.btnStartOnline.addEventListener('click', () => {
    if (!isHost) return;
    const seed = Math.floor(Math.random() * 0xFFFFFF);
    unlimitedAmmoMode = !!DOM.unlimitedAmmo?.checked;
    socket.emit('startGame', { seed, unlimitedAmmoMode });
  });
}

function setRoomStatus(msg, cls) {
  DOM.roomStatus.textContent = msg;
  DOM.roomStatus.className   = cls || '';
}

function init() {
  canvas = document.getElementById('canvas');
  ctx    = canvas.getContext('2d');

  initTerrainCanvas();
  cacheDOMRefs();
  initTouchControls();
  detectOnlineMultiplayerAvailability();
  setupPlayerNameFields();
  bindLobbyEvents();

  requestAnimationFrame(gameLoop);
}

window.addEventListener('DOMContentLoaded', init);
