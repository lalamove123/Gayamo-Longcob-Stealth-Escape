/* ============================================================
PACMAN: SHADOW ESCAPE — game.js  (ENDLESS MODE)
A 2D stealth escape game built with HTML5 Canvas + JS

FEATURES:
- Endless levels — game only ends when all lives are lost
- 3 lives with respawn invincibility (2 seconds)
- Smooth, wall‑clipped vision cones (1 ray/degree)
- 100% dot coverage, 3 keys, power‑ups (invis/speed)
- Procedural audio & music, pause, mobile touch controls
- Difficulty scales every level: faster enemies, sharper vision timer
============================================================ */

'use strict';

/* ============================================================
   1. CONSTANTS & CONFIGURATION
============================================================ */

const TILE_SIZE          = 36;
const PLAYER_SPEED       = 2.1;
const PLAYER_SPEED_FAST  = 4.5;
const POWERUP_DURATION   = 6;

// Difficulty scaling — base values and per-level increments
const ENEMY_SPEED_BASE        = 1.2;
const ENEMY_SPEED_INCREMENT   = 0.12;   // added per level
const ENEMY_SPEED_MAX         = 2.6;    // hard cap

const BASE_SUSPICIOUS_TIME    = 0.9;    // seconds before detected
const SUSP_TIME_DECREMENT     = 0.055;  // subtracted per level
const SUSP_TIME_MIN           = 0.32;   // floor

const SUSPICIOUS_DRAIN = 3.0;

// Level-complete score bonus
const LEVEL_BONUS_BASE = 300;
const LEVEL_BONUS_STEP = 150;           // extra per level beyond 1

const TILE_WALL  = 1;
const TILE_FLOOR = 0;
const TILE_SAFE  = 2;

const PROXIMITY_KILL_DIST = TILE_SIZE * 0.8;

// Lives system
const MAX_LIVES              = 3;
const RESPAWN_INVINCIBLE_DUR = 2.0;   // seconds of blink invincibility

let gamePaused = false;

/* ============================================================
   2. MAZE DEFINITION
============================================================ */

const MAZE_COLS = 21;
const MAZE_ROWS = 17;

const MAZE_DATA = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,1],
  [1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,1],
  [1,0,0,0,0,0,0,1,0,2,2,2,0,1,0,0,0,0,0,0,1],
  [1,0,0,0,1,2,2,0,0,0,0,0,0,1,0,2,1,0,1,0,1],
  [1,1,1,0,1,2,2,0,1,0,1,1,0,1,0,2,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,1,1,1,1,0,1,1,1,0,1,1,1,0,1],
  [1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,1,1,0,1,1,1,0,1,1,0,1,1,0,1],
  [1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,1,0,1,1,1,1,1,1,0,1,1,0,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,0,0,1,2,2,2,0,1,0,1,1,1,0,0,1],
  [1,0,0,0,0,0,0,0,1,2,2,2,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const PLAYER_START = { col: 1, row: 1 };
const EXIT_POS     = { col: 19, row: 15 };

const KEY_POSITIONS = [
  { col: 10, row: 3 },
  { col: 3,  row: 11 },
  { col: 18, row: 7 },
];

const POWERUP_SPAWNS = [
  { col: 5,  row: 5,  type: 'invis' },
  { col: 2,  row: 13, type: 'invis' },
  { col: 1,  row: 7,  type: 'invis' },
  { col: 17, row: 1,  type: 'invis' },
  { col: 15, row: 11, type: 'speed' },
  { col: 19, row: 3,  type: 'speed' },
  { col: 10, row: 13, type: 'speed' },
  { col: 7,  row: 9,  type: 'speed' },
];

const ENEMY_SPAWNS = [
  { patrol: [[2,2],[6,2],[6,4],[2,4],[2,2]],             color: '#ff3cac' },
  { patrol: [[18,2],[14,2],[14,4],[18,4],[18,2]],         color: '#ff6b6b' },
  { patrol: [[2,8],[5,8],[5,10],[2,10],[2,8]],            color: '#c77dff' },
  { patrol: [[9,9],[13,9],[13,11],[9,11],[9,9]],          color: '#ff9f1c' },
  { patrol: [[18,13],[14,13],[14,15],[18,15],[18,13]],    color: '#06d6a0' },
];

/* ============================================================
   3. AUDIO ENGINE (fully synthesized)
============================================================ */

const AudioEngine = (() => {
  let _ctx    = null;
  let _master = null;

  function _getCtx() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
      _master = _ctx.createGain();
      _master.gain.value = 1.7;
      _master.connect(_ctx.destination);
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  function _tone(type, freq, dur, vol = 0.5, startDelay = 0) {
    try {
      const ac   = _getCtx();
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, ac.currentTime + startDelay);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + startDelay + dur);
      osc.connect(gain);
      gain.connect(_master);
      osc.start(ac.currentTime + startDelay);
      osc.stop(ac.currentTime + startDelay + dur);
    } catch (_) {}
  }

  function _sweep(type, freqStart, freqEnd, dur, vol = 0.5, startDelay = 0) {
    try {
      const ac   = _getCtx();
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, ac.currentTime + startDelay);
      osc.frequency.linearRampToValueAtTime(freqEnd, ac.currentTime + startDelay + dur);
      gain.gain.setValueAtTime(vol, ac.currentTime + startDelay);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + startDelay + dur);
      osc.connect(gain);
      gain.connect(_master);
      osc.start(ac.currentTime + startDelay);
      osc.stop(ac.currentTime + startDelay + dur);
    } catch (_) {}
  }

  function _noise(dur, vol = 0.3, startDelay = 0) {
    try {
      const ac  = _getCtx();
      const sz  = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, sz, ac.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < sz; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(vol, ac.currentTime + startDelay);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + startDelay + dur);
      src.connect(gain);
      gain.connect(_master);
      src.start(ac.currentTime + startDelay);
      src.stop(ac.currentTime + startDelay + dur);
    } catch (_) {}
  }

  function dotCollect()    { _tone('sine', 1200, 0.04, 0.18); }
  function keyPickup()     { [523, 659, 784, 1047].forEach((f, i) => _tone('sine', f, 0.22, 0.7, i * 0.07)); }
  function powerupInvis()  { _sweep('sine', 800, 200, 0.35, 0.40); _tone('triangle', 440, 0.5, 0.18, 0.1); _noise(0.12, 0.06, 0.0); }
  function powerupSpeed()  { _sweep('sawtooth', 200, 900, 0.22, 0.35); _tone('square', 1200, 0.10, 0.18, 0.20); _noise(0.06, 0.08); }
  function footstep(snk)   { if (snk) _tone('triangle', 65 + Math.random() * 18, 0.07, 0.10); else { _tone('sawtooth', 50 + Math.random() * 14, 0.055, 0.18); _noise(0.04, 0.06); } }
  function alertDetected() { _tone('sawtooth', 440, 0.13, 0.65); _tone('sawtooth', 330, 0.20, 0.55, 0.10); _tone('square', 220, 0.28, 0.45, 0.22); }
  function alertPulse()    { _tone('square', 220, 0.055, 0.14); }
  function deathJingle()   { [440, 370, 311, 262, 196].forEach((f, i) => _tone('sawtooth', f, 0.22, 0.50, i * 0.15)); _noise(0.08, 0.30, 0.0); }
  function winFanfare()    { [523, 659, 784, 1047, 1318].forEach((f, i) => _tone('sine', f, 0.38, 0.45, i * 0.09)); _noise(0.15, 0.12, 5 * 0.09 + 0.2); }
  function menuClick()     { _tone('sine', 880, 0.07, 0.28); }
  function enterSafeZone() { _sweep('sine', 600, 200, 0.25, 0.22); _tone('triangle', 140, 0.40, 0.12, 0.05); }
  function exitSafeZone()  { _sweep('sine', 200, 600, 0.20, 0.20); }
  function powerupExpire() { _sweep('triangle', 600, 200, 0.28, 0.30); _tone('square', 180, 0.12, 0.12, 0.22); }

  // Procedural music
  let _menuTimers = [], _gameTimers = [], _menuLive = false, _gameLive = false;
  const MENU_NOTES = [220, 261.6, 329.6, 392, 440, 392, 329.6, 261.6];
  const MENU_BAR   = 1.6;

  function _scheduleMenuBar() {
    if (!_menuLive) return;
    MENU_NOTES.forEach((f, i) => {
      const id = setTimeout(() => {
        if (!_menuLive) return;
        _tone('triangle', f, 0.18, 0.22);
        if (i === 0 || i === 4) _tone('triangle', f / 2, 0.28, 0.16);
      }, i * (MENU_BAR / MENU_NOTES.length) * 1000);
      _menuTimers.push(id);
    });
    const loopId = setTimeout(_scheduleMenuBar, MENU_BAR * 1000);
    _menuTimers.push(loopId);
  }

  function startMenuMusic()   { if (_menuLive) return; try { _getCtx(); } catch(_){} _menuLive = true; _syncMuteBtn(); _scheduleMenuBar(); }
  function stopMenuMusic()    { _menuLive = false; _menuTimers.forEach(clearTimeout); _menuTimers = []; _syncMuteBtn(); }
  function toggleMuteMusic()  { if (!_menuLive) startMenuMusic(); else stopMenuMusic(); }

  const GAME_BASS = [110, 0, 130.8, 0, 110, 0, 146.8, 0];
  const GAME_STEP = 0.10;

  function _scheduleGameBar() {
    if (!_gameLive) return;
    GAME_BASS.forEach((f, i) => {
      if (f > 0) {
        const id = setTimeout(() => { if (_gameLive) _tone('sawtooth', f, 0.09, 0.22); }, i * GAME_STEP * 1000);
        _gameTimers.push(id);
      }
      if (i % 2 === 0) {
        const hid = setTimeout(() => { if (_gameLive) _noise(0.04, 0.08); }, i * GAME_STEP * 1000);
        _gameTimers.push(hid);
      }
    });
    const loopId = setTimeout(_scheduleGameBar, GAME_BASS.length * GAME_STEP * 1000);
    _gameTimers.push(loopId);
  }

  function startGameplayMusic() { if (_gameLive) return; try { _getCtx(); } catch(_){} _gameLive = true; _scheduleGameBar(); }
  function stopGameplayMusic()  { _gameLive = false; _gameTimers.forEach(clearTimeout); _gameTimers = []; }

  function _syncMuteBtn() {
    const btn = document.getElementById('menuMuteBtn');
    if (!btn) return;
    if (_menuLive) {
      btn.innerHTML = '🔊 MUSIC';
      btn.style.color = '#00e5ff';
      btn.style.borderColor = 'rgba(0,229,255,0.4)';
    } else {
      btn.innerHTML = '🔇 MUSIC';
      btn.style.color = '#5a6a8a';
      btn.style.borderColor = '#1a2540';
    }
  }

  return {
    dotCollect, keyPickup, powerupInvis, powerupSpeed, footstep,
    alertDetected, alertPulse, deathJingle, winFanfare, menuClick,
    enterSafeZone, exitSafeZone, powerupExpire,
    startMenuMusic, stopMenuMusic, startGameplayMusic, stopGameplayMusic, toggleMuteMusic,
  };
})();

const startMenuMusic     = () => AudioEngine.startMenuMusic();
const stopMenuMusic      = () => AudioEngine.stopMenuMusic();
const toggleMuteMusic    = () => AudioEngine.toggleMuteMusic();
const startGameplayMusic = () => AudioEngine.startGameplayMusic();
const stopGameplayMusic  = () => AudioEngine.stopGameplayMusic();
const playDeathSound     = () => AudioEngine.deathJingle();
const playWinSound       = () => AudioEngine.winFanfare();

/* ============================================================
   4. GAME STATE
============================================================ */

const state = {
  screen:     'menu',
  player:     null,
  enemies:    [],
  dots:       [],
  keys:       [],
  powerups:   [],
  score:      0,
  highScore:  parseInt(localStorage.getItem('pse_highscore') || '0', 10),
  keysCollected: 0,
  dotsLeft:   0,

  // Lives system
  lives:         MAX_LIVES,
  respawnTimer:  0,

  // Progression
  level:              1,
  levelTransitioning: false,
  enemySpeed:         ENEMY_SPEED_BASE,
  suspiciousTime:     BASE_SUSPICIOUS_TIME,

  alertLevel:   'safe',
  suspTimer:    0,
  powerType:    null,
  powerTimer:   0,
  lastTS:       0,
  flashAlpha:   0,

  _prevTileSafe:    false,
  _stepTimer:       0,
  _alertPulseTimer: 0,
  _prevPowerType:   null,
};

/* ============================================================
   5. UTILITY FUNCTIONS
============================================================ */
function pixelToTile(px, py) { return { col: Math.floor(px / TILE_SIZE), row: Math.floor(py / TILE_SIZE) }; }
function tileCenter(col, row) { return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 }; }
function getTile(col, row)    { if (col<0||col>=MAZE_COLS||row<0||row>=MAZE_ROWS) return TILE_WALL; return MAZE_DATA[row][col]; }
function isWall(col, row)     { return getTile(col, row) === TILE_WALL; }

function collidesWall(px, py, radius) {
  const m = radius - 2;
  const probes = [[px-m,py-m],[px+m,py-m],[px-m,py+m],[px+m,py+m]];
  for (const [cx,cy] of probes) { const t = pixelToTile(cx, cy); if (isWall(t.col, t.row)) return true; }
  return false;
}

function wrapAngle(a) { while (a > Math.PI) a -= Math.PI*2; while (a < -Math.PI) a += Math.PI*2; return a; }
function lerp(a, b, t) { return a + (b - a) * t; }
function parseHexColor(hex) {
  return { r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16) };
}

/* ============================================================
   6. PLAYER LOGIC
============================================================ */
function createPlayer() {
  const { x, y } = tileCenter(PLAYER_START.col, PLAYER_START.row);
  return { x, y, radius: TILE_SIZE * 0.38, dir: 0, mouthAnim: 0, dangerLevel: 0, alive: true, _moving: false };
}

function updatePlayer(dt) {
  const p = state.player;
  if (!p || !p.alive) return;

  let dx = 0, dy = 0;
  if (input.left)  dx = -1;
  if (input.right) dx =  1;
  if (input.up)    dy = -1;
  if (input.down)  dy =  1;

  if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
  const spd = (state.powerType === 'speed') ? PLAYER_SPEED_FAST : PLAYER_SPEED;
  const moving = (dx !== 0 || dy !== 0);
  p._moving = moving;

  if (moving) {
    p.dir = Math.atan2(dy, dx);
    p.mouthAnim += dt * 10;
    const pt = pixelToTile(p.x, p.y);
    const onSafe = getTile(pt.col, pt.row) === TILE_SAFE;
    const stepInterval = onSafe
      ? (state.powerType === 'speed' ? 0.18 : 0.28)
      : (state.powerType === 'speed' ? 0.12 : 0.22);
    state._stepTimer += dt;
    if (state._stepTimer >= stepInterval) {
      state._stepTimer = 0;
      AudioEngine.footstep(onSafe);
    }
  } else {
    state._stepTimer = 0;
  }

  const nx = p.x + dx * spd;
  if (!collidesWall(nx, p.y, p.radius)) p.x = nx;
  const ny = p.y + dy * spd;
  if (!collidesWall(p.x, ny, p.radius)) p.y = ny;

  const pt2 = pixelToTile(p.x, p.y);
  const nowSafe = getTile(pt2.col, pt2.row) === TILE_SAFE;
  if (nowSafe && !state._prevTileSafe) AudioEngine.enterSafeZone();
  if (!nowSafe && state._prevTileSafe) AudioEngine.exitSafeZone();
  state._prevTileSafe = nowSafe;
}

/* ============================================================
   7. ENEMY LOGIC
============================================================ */
function createEnemies() {
  return ENEMY_SPAWNS.map(def => {
    const [sc, sr] = def.patrol[0];
    const { x, y } = tileCenter(sc, sr);
    return {
      x, y,
      radius:     TILE_SIZE * 0.40,
      dir:        0,
      color:      def.color,
      patrol:     def.patrol,
      wpIdx:      0,
      pauseTimer: 0,
      alertLevel: 0,
      visAnim:    0,
    };
  });
}

function updateEnemy(enemy, dt) {
  enemy.visAnim += dt * 2;
  if (enemy.pauseTimer > 0) { enemy.pauseTimer -= dt; return; }

  const nextIdx = (enemy.wpIdx + 1) % enemy.patrol.length;
  const [tc, tr] = enemy.patrol[nextIdx];
  const { x: tx, y: ty } = tileCenter(tc, tr);

  const dx = tx - enemy.x;
  const dy = ty - enemy.y;
  const dist = Math.hypot(dx, dy);

  if (dist < state.enemySpeed + 1) {
    enemy.x = tx; enemy.y = ty;
    enemy.wpIdx = nextIdx;
    enemy.pauseTimer = 0.2 + Math.random() * 0.4;
  } else {
    const mx = (dx / dist) * state.enemySpeed;
    const my = (dy / dist) * state.enemySpeed;
    const newX = enemy.x + mx;
    if (!collidesWall(newX, enemy.y, enemy.radius)) enemy.x = newX;
    const newY = enemy.y + my;
    if (!collidesWall(enemy.x, newY, enemy.radius)) enemy.y = newY;
    enemy.dir = Math.atan2(dy, dx);
  }
}

/* ============================================================
   8. DETECTION SYSTEM (with respawn invincibility)
============================================================ */

const VISION_ANGLE     = 50;                       // half-angle degrees
const VISION_RANGE     = 5;                        // tiles
const VISION_ANGLE_RAD = (VISION_ANGLE * Math.PI) / 180;
const VISION_RANGE_PX  = VISION_RANGE * TILE_SIZE;
const RAY_STEP_PX      = TILE_SIZE * 0.2;

function hasLineOfSight(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const totalDist = Math.hypot(dx, dy);
  const numSteps = Math.ceil(totalDist / RAY_STEP_PX);
  if (numSteps === 0) return true;
  const stepX = dx / numSteps, stepY = dy / numSteps;
  let cx = x1, cy = y1;
  for (let i = 1; i <= numSteps; i++) {
    cx += stepX; cy += stepY;
    if (isWall(Math.floor(cx / TILE_SIZE), Math.floor(cy / TILE_SIZE))) return false;
  }
  return true;
}

function detectPlayer(dt) {
  const p = state.player;
  if (!p || !p.alive) return;

  // Invincibility window after respawn
  if (state.respawnTimer > 0) { _clearAllAlerts(dt); return; }

  // Invisibility power-up
  if (state.powerType === 'invis') { _clearAllAlerts(dt); return; }

  // Safe tiles block detection
  const pt = pixelToTile(p.x, p.y);
  if (getTile(pt.col, pt.row) === TILE_SAFE) { _clearAllAlerts(dt); return; }

  // Proximity kill
  for (const enemy of state.enemies) {
    if (Math.hypot(p.x - enemy.x, p.y - enemy.y) < PROXIMITY_KILL_DIST) {
      _setAlert('detected');
      playerDeath();
      return;
    }
  }

  // Vision cone detection
  let anyEnemySees = false;
  for (const enemy of state.enemies) {
    const dx = p.x - enemy.x, dy = p.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    if (dist > VISION_RANGE_PX) { enemy.alertLevel = 0; continue; }
    const angleToPlayer = Math.atan2(dy, dx);
    const angleDiff = Math.abs(wrapAngle(angleToPlayer - enemy.dir));
    if (angleDiff > VISION_ANGLE_RAD) { enemy.alertLevel = 0; continue; }
    if (!hasLineOfSight(enemy.x, enemy.y, p.x, p.y)) { enemy.alertLevel = 0; continue; }
    enemy.alertLevel = 1;
    anyEnemySees = true;
  }

  if (anyEnemySees) {
    if (state.alertLevel === 'safe') AudioEngine.alertDetected();
    state.suspTimer += dt;
    p.dangerLevel = Math.min(state.suspTimer / state.suspiciousTime, 1);
    state._alertPulseTimer += dt;
    if (state._alertPulseTimer >= 0.35) { state._alertPulseTimer = 0; AudioEngine.alertPulse(); }
    if (state.suspTimer >= state.suspiciousTime) {
      p.dangerLevel = 1;
      for (const e of state.enemies) if (e.alertLevel >= 1) e.alertLevel = 2;
      _setAlert('detected');
      playerDeath();
      return;
    }
    for (const e of state.enemies) if (e.alertLevel === 2) e.alertLevel = 1;
    _setAlert('suspicious');
  } else {
    state.suspTimer = Math.max(0, state.suspTimer - dt * SUSPICIOUS_DRAIN);
    state._alertPulseTimer = 0;
    p.dangerLevel = Math.max(0, state.suspTimer / state.suspiciousTime);
    for (const e of state.enemies) if (e.alertLevel === 1) e.alertLevel = 0;
    _setAlert('safe');
  }
}

function _clearAllAlerts(dt) {
  if (dt !== undefined) state.suspTimer = Math.max(0, state.suspTimer - dt * SUSPICIOUS_DRAIN);
  else state.suspTimer = 0;
  for (const e of state.enemies) e.alertLevel = 0;
  if (state.player) state.player.dangerLevel = Math.max(0, state.suspTimer / state.suspiciousTime);
  state._alertPulseTimer = 0;
  _setAlert(state.suspTimer > 0 ? 'suspicious' : 'safe');
}

function _setAlert(level) {
  state.alertLevel = level;
  updateHUDStatus(level);
}

/* ============================================================
   9. PICKUPS, WIN CONDITION, GAME OVER
============================================================ */
function checkPickups() {
  const p = state.player;
  const pr = TILE_SIZE * 0.52;

  for (const dot of state.dots) {
    if (dot.collected) continue;
    if (Math.hypot(p.x - dot.x, p.y - dot.y) < pr) {
      dot.collected = true;
      state.dotsLeft--;
      state.score += 10;
      AudioEngine.dotCollect();
      updateHUD();
    }
  }

  for (const key of state.keys) {
    if (key.collected) continue;
    if (Math.hypot(p.x - key.x, p.y - key.y) < pr) {
      key.collected = true;
      state.keysCollected++;
      state.score += 100;
      AudioEngine.keyPickup();
      updateHUD();
    }
  }

  for (const pu of state.powerups) {
    if (pu.collected) continue;
    if (Math.hypot(p.x - pu.x, p.y - pu.y) < pr) {
      pu.collected = true;
      state.powerType = pu.type;
      state.powerTimer = POWERUP_DURATION;
      state.score += 50;
      if (pu.type === 'invis') AudioEngine.powerupInvis();
      else AudioEngine.powerupSpeed();
      updateHUD();
    }
  }
}

function updatePowerup(dt) {
  if (state.powerTimer <= 0) return;
  state._prevPowerType = state.powerType;
  state.powerTimer -= dt;
  if (state.powerTimer <= 0) {
    state.powerTimer = 0;
    state.powerType = null;
    AudioEngine.powerupExpire();
  }
  updateHUD();
}

// ---- WIN CONDITION: reach exit after all dots + keys ----
function checkWinCondition() {
  const { x, y } = tileCenter(EXIT_POS.col, EXIT_POS.row);
  const nearExit = Math.hypot(state.player.x - x, state.player.y - y) < TILE_SIZE * 0.7;
  if (!nearExit) return;

  if (state.dotsLeft > 0 || state.keysCollected < KEY_POSITIONS.length) {
    const hint = document.getElementById('exitLockedHint');
    if (hint && hint.classList.contains('hidden')) {
      hint.classList.remove('hidden');
      void hint.offsetWidth;
      setTimeout(() => hint.classList.add('hidden'), 2500);
    }
    return;
  }

  triggerLevelComplete();
}

// ---- PLAYER DEATH: respawn or game over ----
function playerDeath() {
  if (state.screen !== 'playing') return;
  playDeathSound();
  state.lives--;
  updateHUDLives();
  state.flashAlpha = 0.75;

  if (state.lives > 0) {
    // Respawn at start with brief invincibility
    const { x, y } = tileCenter(PLAYER_START.col, PLAYER_START.row);
    state.player.x = x;
    state.player.y = y;
    state.player.dir = 0;
    state.player.dangerLevel = 0;
    state.player.alive = true;
    state.respawnTimer = RESPAWN_INVINCIBLE_DUR;
    state.suspTimer = 0;
    state.alertLevel = 'safe';
    for (const e of state.enemies) e.alertLevel = 0;
    updateHUDStatus('safe');
  } else {
    // No lives left — game over
    state.player.alive = false;
    state.screen = 'gameover';
    stopGameplayMusic();
    if (state.score > state.highScore) {
      state.highScore = state.score;
      try { localStorage.setItem('pse_highscore', state.highScore); } catch(_) {}
    }
    document.getElementById('goScore').textContent = 'Score: ' + state.score;
    const goBest = document.getElementById('goBestScore');
    if (goBest) goBest.textContent = 'Best: ' + state.highScore;
    const goLevel = document.getElementById('goLevel');
    if (goLevel) goLevel.textContent = 'Reached Level ' + state.level;
    setTimeout(() => showScreen('screen-gameover'), 650);
  }
}

/* ============================================================
   10. ENDLESS LEVEL SYSTEM
   triggerLevelComplete → shows overlay → startNextLevel
   No separate win screen — the run is endless.
============================================================ */

function triggerLevelComplete() {
  if (state.screen !== 'playing') return;
  if (state.levelTransitioning) return;
  state.levelTransitioning = true;

  // Award level-complete bonus (scales up each level)
  const bonus = LEVEL_BONUS_BASE + (state.level - 1) * LEVEL_BONUS_STEP;
  state.score += bonus;
  if (state.score > state.highScore) {
    state.highScore = state.score;
    try { localStorage.setItem('pse_highscore', state.highScore); } catch(_) {}
  }
  updateHUD();
  playWinSound();

  // Show brief level-complete overlay
  const overlay = document.getElementById('levelTransition');
  const titleEl = document.getElementById('levelTransitionTitle');
  const subEl   = document.getElementById('levelTransitionSub');
  if (overlay && titleEl && subEl) {
    const nextEnemySpeed = Math.min(ENEMY_SPEED_BASE + state.level * ENEMY_SPEED_INCREMENT, ENEMY_SPEED_MAX);
    const speedPct       = Math.round(((nextEnemySpeed / ENEMY_SPEED_BASE) - 1) * 100);
    titleEl.textContent  = `LEVEL ${state.level} COMPLETE!  +${bonus}`;
    subEl.textContent    = speedPct > 0
      ? `Enemies ${speedPct}% faster — LEVEL ${state.level + 1}!`
      : `LEVEL ${state.level + 1} starts now!`;
    overlay.classList.remove('hidden', 'fading-out');
  }

  setTimeout(() => {
    if (overlay) {
      overlay.classList.add('fading-out');
      setTimeout(() => overlay.classList.add('hidden'), 500);
    }
    startNextLevel();
  }, 2400);
}

function startNextLevel() {
  state.level++;
  state.levelTransitioning = false;
  state.keysCollected = 0;
  state.alertLevel = 'safe';
  state.suspTimer = 0;
  state.powerType = null;
  state.powerTimer = 0;
  state.flashAlpha = 0;
  state._prevTileSafe = false;
  state._stepTimer = 0;
  state._alertPulseTimer = 0;
  state._prevPowerType = null;
  state.respawnTimer = 0;

  // Scale difficulty for the new level
  state.enemySpeed    = Math.min(ENEMY_SPEED_BASE + (state.level - 1) * ENEMY_SPEED_INCREMENT, ENEMY_SPEED_MAX);
  state.suspiciousTime = Math.max(BASE_SUSPICIOUS_TIME - (state.level - 1) * SUSP_TIME_DECREMENT, SUSP_TIME_MIN);

  // Respawn player
  const { x, y } = tileCenter(PLAYER_START.col, PLAYER_START.row);
  state.player.x = x; state.player.y = y;
  state.player.dir = 0; state.player.dangerLevel = 0;
  state.player.alive = true; state.player.mouthAnim = 0;

  // Rebuild enemies and pickups fresh
  state.enemies = createEnemies();
  _spawnPickups();

  input.up = input.down = input.left = input.right = false;
  gamePaused = false;

  updateHUD();
  updateHUDStatus('safe');

  // Pulse the level indicator in the HUD
  const lvlEl = document.getElementById('hudLevel');
  if (lvlEl) {
    lvlEl.classList.add('level-up');
    setTimeout(() => lvlEl.classList.remove('level-up'), 1200);
  }
}

function _spawnPickups() {
  state.dots = [];
  const skip = new Set();
  skip.add(`${PLAYER_START.col},${PLAYER_START.row}`);
  skip.add(`${EXIT_POS.col},${EXIT_POS.row}`);
  for (const k of KEY_POSITIONS)  skip.add(`${k.col},${k.row}`);
  for (const p of POWERUP_SPAWNS) skip.add(`${p.col},${p.row}`);

  for (let row = 0; row < MAZE_ROWS; row++) {
    for (let col = 0; col < MAZE_COLS; col++) {
      const t = MAZE_DATA[row][col];
      if ((t === TILE_FLOOR || t === TILE_SAFE) && !skip.has(`${col},${row}`)) {
        const { x, y } = tileCenter(col, row);
        state.dots.push({ x, y, collected: false });
      }
    }
  }
  state.dotsLeft = state.dots.length;

  state.keys = KEY_POSITIONS.map(kp => {
    const { x, y } = tileCenter(kp.col, kp.row);
    return { x, y, collected: false };
  });

  state.powerups = POWERUP_SPAWNS.map(p => {
    const { x, y } = tileCenter(p.col, p.row);
    return { x, y, type: p.type, collected: false, animT: 0 };
  });
}

/* ============================================================
   11. DRAWING / RENDERING
============================================================ */
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

function drawMaze() {
  for (let row = 0; row < MAZE_ROWS; row++) {
    for (let col = 0; col < MAZE_COLS; col++) {
      const x = col * TILE_SIZE, y = row * TILE_SIZE;
      const t = MAZE_DATA[row][col];
      if (t === TILE_WALL) {
        ctx.fillStyle = '#0a1020';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = 'rgba(0,229,255,0.10)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      } else if (t === TILE_SAFE) {
        ctx.fillStyle = '#0e0820';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = 'rgba(120,40,255,0.13)';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = 'rgba(130,50,255,0.22)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      } else {
        ctx.fillStyle = '#060910';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      }
    }
  }
}

function drawExit(ts) {
  const x = EXIT_POS.col * TILE_SIZE, y = EXIT_POS.row * TILE_SIZE;
  const canUse = (state.dotsLeft === 0 && state.keysCollected === KEY_POSITIONS.length);
  const pulse  = Math.sin(ts * 0.004) * 0.3 + 0.7;
  ctx.save();
  ctx.shadowColor = canUse ? `rgba(57,255,20,${pulse * 0.9})` : 'rgba(57,255,20,0.15)';
  ctx.shadowBlur  = canUse ? 18 : 4;
  ctx.fillStyle   = canUse ? `rgba(57,255,20,${0.28 * pulse})` : 'rgba(57,255,20,0.05)';
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = canUse ? `rgba(57,255,20,${pulse})` : 'rgba(57,255,20,0.25)';
  ctx.lineWidth   = 2;
  ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  ctx.fillStyle = canUse ? `rgba(57,255,20,${pulse})` : 'rgba(57,255,20,0.3)';
  ctx.font      = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', x + TILE_SIZE / 2, y + TILE_SIZE * 0.62);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawDots() {
  ctx.fillStyle = 'rgba(200,216,240,0.6)';
  for (const dot of state.dots) {
    if (dot.collected) continue;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawKeys(ts) {
  for (const key of state.keys) {
    if (key.collected) continue;
    const kx = key.x;
    const ky = key.y + Math.sin(ts * 0.005) * 3;
    ctx.save();
    ctx.shadowColor = '#f7c948';
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.arc(kx, ky - 4, 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#f7c948';
    ctx.lineWidth   = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(kx + 3, ky - 1); ctx.lineTo(kx + 12, ky - 1);
    ctx.moveTo(kx + 9, ky - 1); ctx.lineTo(kx + 9, ky + 2);
    ctx.moveTo(kx + 12, ky - 1); ctx.lineTo(kx + 12, ky + 2);
    ctx.strokeStyle = '#f7c948';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.restore();
  }
}

function drawPowerups() {
  for (const pu of state.powerups) {
    if (pu.collected) continue;
    const color = pu.type === 'invis' ? '#00e5ff' : '#39ff14';
    const r     = 7 + Math.sin(pu.animT || 0) * 2;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = 12;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.fillStyle = color + '22';
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font      = '11px serif';
    ctx.textAlign = 'center';
    ctx.fillText(pu.type === 'invis' ? '👁' : '⚡', pu.x, pu.y + 4);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

// Vision cone raycasting
function castRay(ox, oy, angle, maxRange) {
  const stepSize = TILE_SIZE * 0.12;
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  let dist = 0;
  while (dist < maxRange) {
    dist = Math.min(dist + stepSize, maxRange);
    const cx = ox + cosA * dist, cy = oy + sinA * dist;
    const tc = Math.floor(cx / TILE_SIZE), tr = Math.floor(cy / TILE_SIZE);
    if (isWall(tc, tr)) {
      const backDist = Math.max(0, dist - stepSize * 0.5);
      return { x: ox + cosA * backDist, y: oy + sinA * backDist };
    }
  }
  return { x: ox + cosA * maxRange, y: oy + sinA * maxRange };
}

function drawVisionCone(enemy) {
  const range     = VISION_RANGE_PX;
  const halfAngle = VISION_ANGLE_RAD;
  const rayCount  = Math.max(20, Math.ceil((halfAngle * 2) / (Math.PI / 180)));
  const angleStep = (halfAngle * 2) / (rayCount - 1);
  const points    = [];
  for (let i = 0; i < rayCount; i++) {
    points.push(castRay(enemy.x, enemy.y, enemy.dir - halfAngle + i * angleStep, range));
  }

  ctx.save();
  const pulse = Math.sin(enemy.visAnim) * 0.05 + 0.14;
  let baseRGBA;
  if (enemy.alertLevel >= 2)      baseRGBA = 'rgba(255,68,68,0.65)';
  else if (enemy.alertLevel >= 1) baseRGBA = 'rgba(255,200,0,0.52)';
  else {
    const { r, g, b } = parseHexColor(enemy.color);
    baseRGBA = `rgba(${r},${g},${b},${(pulse + 0.08).toFixed(2)})`;
  }

  const grad = ctx.createRadialGradient(enemy.x, enemy.y, 0, enemy.x, enemy.y, range);
  grad.addColorStop(0, baseRGBA);
  grad.addColorStop(1, baseRGBA.replace(/[\d.]+\)$/, '0)'));

  ctx.fillStyle  = grad;
  ctx.shadowColor = baseRGBA;
  ctx.shadowBlur  = 12;
  ctx.beginPath();
  ctx.moveTo(enemy.x, enemy.y);
  for (const pt of points) ctx.lineTo(pt.x, pt.y);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // Detection arc progress ring
  if (state.suspTimer > 0 && enemy.alertLevel >= 1) {
    const progress   = Math.min(state.suspTimer / state.suspiciousTime, 1);
    const arcRadius  = enemy.radius + 6;
    const startAngle = -Math.PI / 2;
    const endAngle   = startAngle + Math.PI * 2 * progress;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, arcRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 3;
    ctx.stroke();
    const arcColor = progress < 0.6
      ? 'rgba(255,220,0,0.9)'
      : `rgba(255,${Math.round(220 * (1 - progress))},0,0.9)`;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, arcRadius, startAngle, endAngle);
    ctx.strokeStyle = arcColor;
    ctx.lineWidth   = 3;
    ctx.shadowColor = arcColor;
    ctx.shadowBlur  = 6;
    ctx.stroke();
  }
  ctx.restore();
}

function drawEnemy(enemy) {
  const s         = TILE_SIZE * 0.42;
  const bodyColor = enemy.alertLevel >= 2 ? '#ff4444' : (enemy.alertLevel >= 1 ? '#ffcc00' : enemy.color);
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.shadowColor = bodyColor;
  ctx.shadowBlur  = enemy.alertLevel >= 1 ? 22 : 8;
  ctx.beginPath();
  ctx.arc(0, -s * 0.3, s, Math.PI, 0, false);
  ctx.lineTo(s, s * 0.7);
  for (let i = 4; i >= 0; i--) {
    const wx = -s + (i / 4) * s * 2;
    const wy = s * 0.7 + (i % 2 === 0 ? s * 0.28 : 0);
    if (i === 4) ctx.lineTo(wx, wy);
    else ctx.quadraticCurveTo(wx + s / 4, s * 0.7, wx, wy);
  }
  ctx.closePath();
  ctx.fillStyle = bodyColor;
  ctx.fill();
  const eox = Math.cos(enemy.dir) * s * 0.22;
  const eoy = Math.sin(enemy.dir) * s * 0.22;
  ctx.shadowBlur = 0;
  ctx.fillStyle  = '#fff';
  ctx.beginPath(); ctx.arc(-s * 0.32, -s * 0.28, s * 0.19, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( s * 0.32, -s * 0.28, s * 0.19, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(-s * 0.32 + eox * 0.5, -s * 0.28 + eoy * 0.5, s * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( s * 0.32 + eox * 0.5, -s * 0.28 + eoy * 0.5, s * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const p = state.player;
  if (!p) return;
  ctx.save();
  ctx.translate(p.x, p.y);

  // Blink during respawn invincibility
  if (state.respawnTimer > 0 && Math.floor(state.respawnTimer * 8) % 2 === 0) {
    ctx.restore();
    return;
  }

  let color;
  if (state.powerType === 'invis')       color = 'rgba(0,229,255,0.45)';
  else if (state.powerType === 'speed')  color = '#39ff14';
  else if (p.dangerLevel > 0.8)          color = '#ff4444';
  else if (p.dangerLevel > 0.3) {
    const t = (p.dangerLevel - 0.3) / 0.5;
    color = `rgb(${Math.round(lerp(247,255,t))},${Math.round(lerp(201,68,t))},${Math.round(lerp(72,68,t))})`;
  } else color = '#f7c948';

  ctx.shadowColor = color;
  ctx.shadowBlur  = 14;
  ctx.rotate(p.dir);
  const mouth = Math.sin(p.mouthAnim) > 0 ? 0.28 : 0.04;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, p.radius, mouth, Math.PI * 2 - mouth, false);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(p.radius * 0.22, -p.radius * 0.52, p.radius * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = state.powerType === 'invis' ? 'rgba(0,0,0,0.4)' : '#050810';
  ctx.fill();
  if (state.powerType === 'invis') {
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawVignette() {
  const W = canvas.width, H = canvas.height;
  const g = ctx.createRadialGradient(W/2, H/2, W*0.18, W/2, H/2, W*0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawFlash() {
  if (state.flashAlpha <= 0) return;
  ctx.fillStyle = `rgba(255,0,0,${state.flashAlpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  state.flashAlpha = Math.max(0, state.flashAlpha - 0.025);
}

function drawSuspicionOverlay(ts) {
  if (state.alertLevel !== 'suspicious') return;
  const progress = Math.min(state.suspTimer / state.suspiciousTime, 1);
  const pulse    = Math.sin(ts * 0.012) * 0.5 + 0.5;
  ctx.fillStyle  = `rgba(255,200,0,${progress * 0.08 * pulse})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPauseOverlay() {
  if (!gamePaused) return;
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font      = 'bold 30px "Bungee", cursive';
  ctx.fillStyle = '#00e5ff';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,229,255,0.8)';
  ctx.shadowBlur  = 16;
  ctx.fillText('⏸  PAUSED', canvas.width / 2, canvas.height / 2);
  ctx.shadowBlur  = 0;
  ctx.font        = '14px "Share Tech Mono", monospace';
  ctx.fillStyle   = '#5a6a8a';
  ctx.fillText('Press P or click Resume to continue', canvas.width / 2, canvas.height / 2 + 40);
  ctx.textAlign   = 'left';
}

/* ============================================================
   12. GAME LOOP
============================================================ */
function gameLoop(ts) {
  const dt = Math.min((ts - state.lastTS) / 1000, 0.05);
  state.lastTS = ts;

  const playing = state.screen === 'playing' && state.player && state.player.alive;

  if (playing && !gamePaused && !state.levelTransitioning) {
    if (state.respawnTimer > 0) state.respawnTimer = Math.max(0, state.respawnTimer - dt);

    updatePlayer(dt);
    for (const e of state.enemies) updateEnemy(e, dt);
    for (const pu of state.powerups) pu.animT = (pu.animT || 0) + dt * 3;
    updatePowerup(dt);
    detectPlayer(dt);
    checkPickups();
    checkWinCondition();
  }

  ctx.fillStyle = '#020408';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (state.screen === 'playing' || state.screen === 'gameover') {
    drawMaze();
    drawExit(ts);
    drawDots();
    drawKeys(ts);
    drawPowerups();
    for (const e of state.enemies) drawVisionCone(e);
    for (const e of state.enemies) drawEnemy(e);
    if (state.player) drawPlayer();
    drawSuspicionOverlay(ts);
    drawVignette();
    drawFlash();
    drawPauseOverlay();
  }

  requestAnimationFrame(gameLoop);
}

/* ============================================================
   13. INPUT HANDLING
============================================================ */
const input = { up: false, down: false, left: false, right: false };

function togglePause() {
  if (state.screen !== 'playing') return;
  gamePaused = !gamePaused;
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) pauseBtn.textContent = gamePaused ? '▶ Resume' : '⏸ Pause';
  if (!gamePaused) AudioEngine.menuClick();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P')                           { togglePause(); e.preventDefault(); }
  if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') { input.up    = true; e.preventDefault(); }
  if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') { input.down  = true; e.preventDefault(); }
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') { input.left  = true; e.preventDefault(); }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { input.right = true; e.preventDefault(); }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') input.up    = false;
  if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') input.down  = false;
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') input.left  = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
});

function bindBtn(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  const on  = () => (input[key] = true);
  const off = () => (input[key] = false);
  el.addEventListener('touchstart',  (e) => { e.preventDefault(); on();  }, { passive: false });
  el.addEventListener('touchend',    (e) => { e.preventDefault(); off(); }, { passive: false });
  el.addEventListener('touchcancel', (e) => { e.preventDefault(); off(); }, { passive: false });
  el.addEventListener('mousedown',  on);
  el.addEventListener('mouseup',    off);
  el.addEventListener('mouseleave', off);
}
bindBtn('mBtn-up',    'up');
bindBtn('mBtn-down',  'down');
bindBtn('mBtn-left',  'left');
bindBtn('mBtn-right', 'right');

const pauseButton = document.getElementById('pauseBtn');
if (pauseButton) pauseButton.addEventListener('click', togglePause);

/* ============================================================
   14. SCREEN MANAGEMENT, HUD & BOOT
============================================================ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function updateHUD() {
  document.getElementById('hudScore').textContent = state.score;
  const lvlHud = document.getElementById('hudLevel');
  if (lvlHud) lvlHud.textContent = state.level;

  const collected = state.dots.filter(d => d.collected).length;
  document.getElementById('hudDots').textContent = `${collected}/${state.dots.length}`;

  const keyEl = document.getElementById('hudKey');
  keyEl.textContent  = `${state.keysCollected}/${KEY_POSITIONS.length}`;
  keyEl.style.color  = state.keysCollected === KEY_POSITIONS.length ? 'var(--col-yellow)' : 'var(--col-muted)';

  const puEl = document.getElementById('hudPower');
  if (state.powerType && state.powerTimer > 0) {
    puEl.textContent = (state.powerType === 'invis' ? '👁 ' : '⚡ ') + Math.ceil(state.powerTimer) + 's';
    puEl.style.color = state.powerType === 'invis' ? 'var(--col-cyan)' : 'var(--col-green)';
  } else {
    puEl.textContent = '—';
    puEl.style.color = 'var(--col-muted)';
  }

  if (state.score > state.highScore) {
    state.highScore = state.score;
    try { localStorage.setItem('pse_highscore', state.highScore); } catch(_) {}
  }
  const hsEl = document.getElementById('hudHighScore');
  if (hsEl) hsEl.textContent = state.highScore;

  updateHUDLives();
}

function updateHUDLives() {
  const el = document.getElementById('hudLives');
  if (!el) return;
  let hearts = '';
  for (let i = 0; i < state.lives; i++) hearts += '❤️';
  el.textContent = hearts || '—';
}

function updateHUDStatus(level) {
  const el = document.getElementById('hudStatus');
  if (!el) return;
  const labels = { safe: 'SAFE', suspicious: 'SUSPICIOUS!', detected: 'DETECTED!' };
  el.textContent = labels[level] || 'SAFE';
  el.className   = 'hud-status status-' + level;
  const ov = document.getElementById('alertOverlay');
  const at = document.getElementById('alertText');
  if (level === 'suspicious') {
    ov.classList.remove('hidden');
    at.textContent = '!';
    at.style.color = 'var(--col-yellow)';
  } else if (level === 'detected') {
    ov.classList.remove('hidden');
    at.textContent = '⚠ DETECTED!';
    at.style.color = 'var(--col-red)';
  } else {
    ov.classList.add('hidden');
  }
}

function resizeCanvas() {
  const mazeW = MAZE_COLS * TILE_SIZE, mazeH = MAZE_ROWS * TILE_SIZE;
  canvas.width  = mazeW;
  canvas.height = mazeH;
  requestAnimationFrame(() => {
    const wrapper = document.getElementById('canvasWrapper');
    if (!wrapper) return;
    const rect  = wrapper.getBoundingClientRect();
    const ww    = rect.width  > 20 ? rect.width  : window.innerWidth;
    const wh    = rect.height > 20 ? rect.height : window.innerHeight - 60;
    const scale = Math.min(ww / mazeW, wh / mazeH, 2.0);
    canvas.style.width  = Math.floor(mazeW * scale) + 'px';
    canvas.style.height = Math.floor(mazeH * scale) + 'px';
  });
}

function startGame() {
  state.score        = 0;
  state.keysCollected = 0;
  state.alertLevel   = 'safe';
  state.suspTimer    = 0;
  state.powerType    = null;
  state.powerTimer   = 0;
  state.flashAlpha   = 0;
  state.screen       = 'playing';
  state._prevTileSafe    = false;
  state._stepTimer       = 0;
  state._alertPulseTimer = 0;
  state._prevPowerType   = null;

  // Reset lives
  state.lives        = MAX_LIVES;
  state.respawnTimer = 0;

  input.up = input.down = input.left = input.right = false;
  gamePaused = false;

  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) pauseBtn.textContent = '⏸ Pause';

  // Reset level & difficulty to base values
  state.level              = 1;
  state.levelTransitioning = false;
  state.enemySpeed         = ENEMY_SPEED_BASE;
  state.suspiciousTime     = BASE_SUSPICIOUS_TIME;

  state.player  = createPlayer();
  state.enemies = createEnemies();
  _spawnPickups();

  updateHUD();
  updateHUDStatus('safe');
  showScreen('screen-game');
  startGameplayMusic();
  state.lastTS = performance.now();
  setTimeout(resizeCanvas, 60);
  showInGameHint();
}

function showInGameHint() {
  const hint = document.getElementById('inGameHint');
  if (!hint) return;
  hint.classList.remove('hidden');
  hint.style.opacity = '1';
  setTimeout(() => {
    hint.style.transition = 'opacity 1s ease';
    hint.style.opacity    = '0';
    setTimeout(() => hint.classList.add('hidden'), 1000);
  }, 4000);
}

function spawnMenuDots() {
  const c = document.getElementById('menuBgDots');
  if (!c) return;
  for (let i = 0; i < 28; i++) {
    const d = document.createElement('div');
    d.className = 'menu-bg-dot';
    d.style.left              = (Math.random() * 100) + 'vw';
    d.style.bottom            = '-10px';
    d.style.width = d.style.height = (4 + Math.random() * 5) + 'px';
    d.style.animationDuration = (5 + Math.random() * 8) + 's';
    d.style.animationDelay    = (Math.random() * 10) + 's';
    c.appendChild(d);
  }
}

function handleStartClick() {
  AudioEngine.menuClick();
  stopMenuMusic();
  startGame();
}

document.getElementById('btnStart').addEventListener('click', handleStartClick);
document.getElementById('btnRetry').addEventListener('click', handleStartClick);
document.getElementById('btnPlayAgain').addEventListener('click', handleStartClick);
window.addEventListener('resize', resizeCanvas);

spawnMenuDots();
startMenuMusic();
const hsElInit = document.getElementById('hudHighScore');
if (hsElInit) hsElInit.textContent = state.highScore;
document.getElementById('screen-menu').addEventListener('click', function(e) {
  if (e.target.id === 'btnStart' || e.target.id === 'menuMuteBtn') return;
  startMenuMusic();
});
requestAnimationFrame(gameLoop);