/* ============================================================
   PACMAN: SHADOW ESCAPE — Silent AI Demo (No Alerts / No HUD)
   - Fully autonomous player (collects dots, key, exits)
   - No popup messages, no text overlay – pure visuals
   ============================================================ */

(function() {
  'use strict';

  const canvas = document.getElementById('previewCanvas');
  if (!canvas) return;

  canvas.width = 320;
  canvas.height = 320;

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const TILE = 32;
  const COLS = 10, ROWS = 10;

  // Maze definition (1=wall, 0=floor)
  const maze = [
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,0,0,0,1],
    [1,0,1,0,0,0,1,1,0,1],
    [1,0,1,1,1,0,0,1,0,1],
    [1,0,0,0,0,0,1,1,0,1],
    [1,1,1,0,1,0,0,0,0,1],
    [1,0,0,0,1,1,1,0,1,1],
    [1,0,1,0,0,0,0,0,0,1],
    [1,0,1,1,1,0,1,1,0,1],
    [1,1,1,1,1,1,1,1,1,1],
  ];

  // ------------------------------------------------------------
  //  Game constants
  // ------------------------------------------------------------
  const PLAYER_RADIUS = 10;
  const ENEMY_RADIUS = 10;
  const PLAYER_SPEED = 90;        // pixels per second
  const ENEMY_SPEED = 55;         // pixels per second
  const VISION_RANGE_PX = 90;
  const VISION_ANGLE_DEG = 55;
  const VISION_ANGLE_RAD = (VISION_ANGLE_DEG * Math.PI) / 180;
  const RAY_STEP_PX = 6;

  // Alert system
  const SUSPICIOUS_TIME = 2.0;     // seconds to fill the bar
  const SUSPICIOUS_DRAIN = 2.5;    // drain speed multiplier

  // ------------------------------------------------------------
  //  Game state
  // ------------------------------------------------------------
  const player = {
    px: TILE + TILE/2, py: TILE + TILE/2,
    dir: 0,
    mouthTime: 0
  };

  const enemy = {
    px: 7*TILE + TILE/2, py: 7*TILE + TILE/2,
    dir: Math.PI,
    baseSpeed: ENEMY_SPEED
  };

  let suspicion = 0;
  let alertLevel = 'safe';
  let detectionFlash = 0;

  // Collectibles
  let dots = [];
  let hasKey = false;
  let key = null;
  const exitPos = { col: 8, row: 1 };
  const keyPos = { col: 3, row: 5 };

  // Populate dots
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (maze[r][c] === 0) {
        if ((c === 1 && r === 1) || (c === keyPos.col && r === keyPos.row) || (c === exitPos.col && r === exitPos.row)) continue;
        dots.push({ x: c, y: r, collected: false });
      }
    }
  }
  key = { x: keyPos.col, y: keyPos.row, collected: false };

  let score = 0;

  // ------------------------------------------------------------
  //  AI Pathfinding (BFS)
  // ------------------------------------------------------------
  let aiPath = [];
  let currentTarget = null;

  function bfsFindTarget(startCol, startRow, condition) {
    const queue = [{ col: startCol, row: startRow, path: [] }];
    const visited = new Set();
    visited.add(`${startCol},${startRow}`);
    while (queue.length) {
      const { col, row, path } = queue.shift();
      if (condition(col, row)) {
        return path;
      }
      const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
      for (const [dx, dy] of dirs) {
        const nc = col + dx, nr = row + dy;
        if (!isWall(nc, nr) && !visited.has(`${nc},${nr}`)) {
          visited.add(`${nc},${nr}`);
          queue.push({ col: nc, row: nr, path: [...path, { col: nc, row: nr }] });
        }
      }
    }
    return null;
  }

  function tilePathToWaypoints(path) {
    return path.map(tile => ({
      x: tile.col * TILE + TILE/2,
      y: tile.row * TILE + TILE/2
    }));
  }

  function recomputeAIPath() {
    const startTile = { col: Math.floor(player.px / TILE), row: Math.floor(player.py / TILE) };
    let targetTiles = null;
    let targetType = null;

    // 1. Find nearest uncollected dot
    let nearestDotPath = null;
    let nearestDist = Infinity;
    for (let dot of dots) {
      if (!dot.collected) {
        const path = bfsFindTarget(startTile.col, startTile.row, (c, r) => c === dot.x && r === dot.y);
        if (path && path.length < nearestDist) {
          nearestDist = path.length;
          nearestDotPath = path;
        }
      }
    }
    if (nearestDotPath) {
      targetTiles = nearestDotPath;
      targetType = 'dot';
    }

    // 2. If no dots left and key not collected
    if (!targetTiles && !key.collected) {
      const path = bfsFindTarget(startTile.col, startTile.row, (c, r) => c === key.x && r === key.y);
      if (path) {
        targetTiles = path;
        targetType = 'key';
      }
    }

    // 3. If key collected and all dots collected, go to exit
    if (!targetTiles && hasKey && dots.every(d => d.collected)) {
      const path = bfsFindTarget(startTile.col, startTile.row, (c, r) => c === exitPos.col && r === exitPos.row);
      if (path) {
        targetTiles = path;
        targetType = 'exit';
      }
    }

    if (targetTiles) {
      aiPath = tilePathToWaypoints(targetTiles);
      currentTarget = targetType;
    } else {
      aiPath = [];
      currentTarget = null;
    }
  }

  function onTargetReached() {
    recomputeAIPath();
  }

  // ------------------------------------------------------------
  //  Helper functions
  // ------------------------------------------------------------
  function isWall(col, row) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
    return maze[Math.floor(row)][Math.floor(col)] === 1;
  }

  function collidesWall(px, py, radius) {
    const left   = Math.floor((px - radius) / TILE);
    const right  = Math.floor((px + radius) / TILE);
    const top    = Math.floor((py - radius) / TILE);
    const bottom = Math.floor((py + radius) / TILE);
    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        if (isWall(col, row)) return true;
      }
    }
    return false;
  }

  function hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const totalDist = Math.hypot(dx, dy);
    const numSteps = Math.ceil(totalDist / RAY_STEP_PX);
    if (numSteps === 0) return true;
    const stepX = dx / numSteps, stepY = dy / numSteps;
    let cx = x1, cy = y1;
    for (let i = 1; i <= numSteps; i++) {
      cx += stepX; cy += stepY;
      const tileX = Math.floor(cx / TILE), tileY = Math.floor(cy / TILE);
      if (isWall(tileX, tileY)) return false;
    }
    return true;
  }

  // ------------------------------------------------------------
  //  Detection (3‑stage alert)
  // ------------------------------------------------------------
  function updateDetection(dt) {
    const dx = player.px - enemy.px;
    const dy = player.py - enemy.py;
    const dist = Math.hypot(dx, dy);
    let detected = false;

    if (dist <= VISION_RANGE_PX) {
      const angleToPlayer = Math.atan2(dy, dx);
      let angleDiff = Math.abs(angleToPlayer - enemy.dir);
      if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      angleDiff = Math.abs(angleDiff);
      if (angleDiff <= VISION_ANGLE_RAD) {
        if (hasLineOfSight(enemy.px, enemy.py, player.px, player.py)) {
          detected = true;
        }
      }
    }

    if (detected) {
      suspicion += dt;
      if (suspicion >= SUSPICIOUS_TIME) {
        alertLevel = 'detected';
        detectionFlash = 0.5;
        suspicion = 0;
        alertLevel = 'safe';
        player.px = TILE + TILE/2;
        player.py = TILE + TILE/2;
        score = Math.max(0, score - 50);
        recomputeAIPath();
      } else {
        alertLevel = 'suspicious';
      }
    } else {
      suspicion = Math.max(0, suspicion - dt * SUSPICIOUS_DRAIN);
      if (suspicion === 0) alertLevel = 'safe';
    }
    detectionFlash = Math.max(0, detectionFlash - dt * 2);
  }

  // ------------------------------------------------------------
  //  Enemy AI (random walk)
  // ------------------------------------------------------------
  let enemyTarget = null;
  let enemyPause = 0;
  let previousTile = { col: 7, row: 7 };

  function getRandomDirection(col, row, avoidCol, avoidRow) {
    const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
    const valid = [];
    for (let d of dirs) {
      const nc = col + d[0], nr = row + d[1];
      if (!isWall(nc, nr)) {
        if (nc === avoidCol && nr === avoidRow) continue;
        valid.push(d);
      }
    }
    if (valid.length === 0) {
      for (let d of dirs) {
        const nc = col + d[0], nr = row + d[1];
        if (!isWall(nc, nr)) valid.push(d);
      }
    }
    if (valid.length === 0) return [0,0];
    return valid[Math.floor(Math.random() * valid.length)];
  }

  function updateEnemy(dt) {
    if (enemyPause > 0) {
      enemyPause -= dt;
      return;
    }
    if (!enemyTarget) {
      const currentTile = { col: Math.floor(enemy.px / TILE), row: Math.floor(enemy.py / TILE) };
      const dir = getRandomDirection(currentTile.col, currentTile.row, previousTile.col, previousTile.row);
      if (dir[0] === 0 && dir[1] === 0) return;
      const newCol = currentTile.col + dir[0], newRow = currentTile.row + dir[1];
      enemyTarget = tileCenter(newCol, newRow);
      previousTile = currentTile;
    }
    const dx = enemyTarget.x - enemy.px, dy = enemyTarget.y - enemy.py;
    const dist = Math.hypot(dx, dy);
    if (dist < ENEMY_SPEED * dt + 1) {
      enemy.px = enemyTarget.x; enemy.py = enemyTarget.y;
      enemyTarget = null;
      enemyPause = 0.3;
    } else {
      const stepX = (dx / dist) * ENEMY_SPEED * dt;
      const stepY = (dy / dist) * ENEMY_SPEED * dt;
      const newX = enemy.px + stepX, newY = enemy.py + stepY;
      if (!collidesWall(newX, enemy.py, ENEMY_RADIUS)) enemy.px = newX;
      if (!collidesWall(enemy.px, newY, ENEMY_RADIUS)) enemy.py = newY;
    }
    if (enemyTarget) {
      const dx = enemyTarget.x - enemy.px, dy = enemyTarget.y - enemy.py;
      if (Math.hypot(dx, dy) > 0.1) enemy.dir = Math.atan2(dy, dx);
    }
  }

  function tileCenter(col, row) {
    return { x: col * TILE + TILE/2, y: row * TILE + TILE/2 };
  }

  // ------------------------------------------------------------
  //  AI Player movement
  // ------------------------------------------------------------
  function updatePlayer(dt) {
    if (aiPath.length === 0) {
      recomputeAIPath();
      if (aiPath.length === 0) return;
    }

    const target = aiPath[0];
    const dx = target.x - player.px;
    const dy = target.y - player.py;
    const dist = Math.hypot(dx, dy);
    if (dist < PLAYER_SPEED * dt + 2) {
      player.px = target.x;
      player.py = target.y;
      aiPath.shift();
      if (aiPath.length === 0) {
        onTargetReached();
      }
    } else {
      const step = PLAYER_SPEED * dt;
      const moveX = (dx / dist) * step;
      const moveY = (dy / dist) * step;
      const newX = player.px + moveX;
      const newY = player.py + moveY;
      if (!collidesWall(newX, player.py, PLAYER_RADIUS)) player.px = newX;
      if (!collidesWall(player.px, newY, PLAYER_RADIUS)) player.py = newY;
      if (Math.abs(moveX) > 0.01 || Math.abs(moveY) > 0.01) {
        player.dir = Math.atan2(moveY, moveX);
      }
    }
    player.mouthTime += dt;
  }

  // ------------------------------------------------------------
  //  Pickups & win (silent reset)
  // ------------------------------------------------------------
  function checkPickups() {
    const pr = PLAYER_RADIUS + 2;
    for (let dot of dots) {
      if (!dot.collected) {
        const dotX = dot.x * TILE + TILE/2, dotY = dot.y * TILE + TILE/2;
        if (Math.hypot(player.px - dotX, player.py - dotY) < pr) {
          dot.collected = true;
          score += 10;
        }
      }
    }
    if (!key.collected) {
      const keyX = key.x * TILE + TILE/2, keyY = key.y * TILE + TILE/2;
      if (Math.hypot(player.px - keyX, player.py - keyY) < pr) {
        key.collected = true;
        hasKey = true;
        score += 100;
      }
    }
    if (hasKey && dots.every(d => d.collected)) {
      const exitX = exitPos.col * TILE + TILE/2, exitY = exitPos.row * TILE + TILE/2;
      if (Math.hypot(player.px - exitX, player.py - exitY) < pr) {
        // Silent win – just reset the game
        resetGame();
      }
    }
  }

  function resetGame() {
    player.px = TILE + TILE/2;
    player.py = TILE + TILE/2;
    player.dir = 0;
    player.mouthTime = 0;
    hasKey = false;
    score = 0;
    suspicion = 0;
    alertLevel = 'safe';
    detectionFlash = 0;
    for (let dot of dots) dot.collected = false;
    key.collected = false;
    enemyTarget = null;
    enemyPause = 0;
    previousTile = { col: 7, row: 7 };
    enemy.px = 7*TILE + TILE/2;
    enemy.py = 7*TILE + TILE/2;
    enemy.dir = Math.PI;
    aiPath = [];
    currentTarget = null;
    recomputeAIPath();
  }

  // ------------------------------------------------------------
  //  Drawing (no HUD, only the game visuals)
  // ------------------------------------------------------------
  function drawWall(c, r) {
    const x = c * TILE, y = r * TILE;
    ctx.fillStyle = '#0d1120';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = 'rgba(0,229,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    const grad = ctx.createLinearGradient(x, y, x + TILE, y + TILE);
    grad.addColorStop(0, 'rgba(0,229,255,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, TILE, TILE);
  }

  function drawFloor(c, r) {
    const x = c * TILE, y = r * TILE;
    ctx.fillStyle = '#060910';
    ctx.fillRect(x, y, TILE, TILE);
  }

  function drawDot(dot) {
    if (dot.collected) return;
    const x = dot.x * TILE + TILE/2, y = dot.y * TILE + TILE/2;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200,216,240,0.8)';
    ctx.fill();
  }

  function drawKey() {
    if (key.collected) return;
    const x = key.x * TILE + TILE/2;
    const y = key.y * TILE + TILE/2 + Math.sin(Date.now() * 0.005) * 3;
    ctx.save();
    ctx.shadowColor = '#f7c948';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, y - 4, 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#f7c948';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 1); ctx.lineTo(x + 10, y - 1);
    ctx.moveTo(x + 7, y - 1); ctx.lineTo(x + 7, y + 2);
    ctx.moveTo(x + 10, y - 1); ctx.lineTo(x + 10, y + 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawExit() {
    const x = exitPos.col * TILE, y = exitPos.row * TILE;
    const canUse = hasKey && dots.every(d => d.collected);
    const pulse = Math.sin(Date.now() * 0.004) * 0.3 + 0.7;
    ctx.fillStyle = canUse ? `rgba(57,255,20,${0.2 * pulse})` : 'rgba(57,255,20,0.05)';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = canUse ? `rgba(57,255,20,${pulse})` : 'rgba(57,255,20,0.25)';
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = canUse ? `rgba(57,255,20,${pulse})` : 'rgba(57,255,20,0.4)';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('EXIT', x + TILE/2 - 8, y + TILE/2 + 3);
  }

  function drawVisionCone() {
    const range = VISION_RANGE_PX;
    const angle = VISION_ANGLE_RAD;
    const pulse = (Math.sin(Date.now() * 0.006) * 0.1 + 0.2);
    let alpha = 0.15 + pulse;
    if (alertLevel === 'suspicious') alpha = 0.4;
    if (alertLevel === 'detected') alpha = 0.7;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(enemy.px, enemy.py);
    ctx.arc(enemy.px, enemy.py, range, enemy.dir - angle, enemy.dir + angle);
    ctx.closePath();
    const grad = ctx.createRadialGradient(enemy.px, enemy.py, 0, enemy.px, enemy.py, range);
    const color = alertLevel === 'detected' ? '255,68,68' : '255,60,172';
    grad.addColorStop(0, `rgba(${color}, ${alpha * 2})`);
    grad.addColorStop(1, `rgba(${color}, 0)`);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy() {
    ctx.save();
    ctx.translate(enemy.px, enemy.py);
    const bodyColor = alertLevel === 'detected' ? '#ff4444' : '#ff3cac';
    ctx.beginPath();
    ctx.arc(0, -2, 10, Math.PI, 0, false);
    ctx.lineTo(10, 8);
    ctx.bezierCurveTo(7, 4, 3, 10, 0, 6);
    ctx.bezierCurveTo(-3, 10, -7, 4, -10, 8);
    ctx.closePath();
    ctx.fillStyle = bodyColor;
    ctx.shadowColor = bodyColor;
    ctx.shadowBlur = 12;
    ctx.fill();
    const eyeOffX = Math.cos(enemy.dir) * 3;
    const eyeOffY = Math.sin(enemy.dir) * 3;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-4 + eyeOffX*0.3, -3, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4 + eyeOffX*0.3, -3, 3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-4 + eyeOffX, -3 + eyeOffY*0.5, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4 + eyeOffX, -3 + eyeOffY*0.5, 1.5, 0, Math.PI*2); ctx.fill();
    if (alertLevel === 'suspicious' || alertLevel === 'detected') {
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = alertLevel === 'detected' ? '#ff4444' : '#ffcc00';
      ctx.fillText('!', -4, -18);
    }
    ctx.restore();
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(player.px, player.py);
    let color = '#f7c948';
    if (alertLevel === 'suspicious') color = '#ffa500';
    else if (alertLevel === 'detected') color = '#ff4444';
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.rotate(player.dir);
    const mouthOpen = Math.sin(player.mouthTime * 15) > 0;
    const mouthRad = mouthOpen ? 0.28 : 0.04;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, PLAYER_RADIUS, mouthRad, Math.PI * 2 - mouthRad);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawFlash() {
    if (detectionFlash <= 0) return;
    ctx.fillStyle = `rgba(255,0,0,${detectionFlash * 0.6})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------
  //  Animation loop
  // ------------------------------------------------------------
  let last = 0;
  function animate(ts) {
    const dt = Math.min((ts - last) / 1000, 0.05);
    if (isNaN(dt)) { last = ts; requestAnimationFrame(animate); return; }
    last = ts;

    updatePlayer(dt);
    updateEnemy(dt);
    updateDetection(dt);
    checkPickups();

    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (maze[r][c] === 1) drawWall(c, r);
        else drawFloor(c, r);
      }
    }
    for (let dot of dots) drawDot(dot);
    drawKey();
    drawExit();
    drawVisionCone();
    drawEnemy();
    drawPlayer();
    drawFlash();

    const vig = ctx.createRadialGradient(W/2, H/2, W*0.2, W/2, H/2, W*0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    requestAnimationFrame(animate);
  }

  // Start the silent AI demo
  recomputeAIPath();
  requestAnimationFrame(animate);
})();