/* ============================================================
   PACMAN: SHADOW ESCAPE — Landing Page Script
   Animated maze preview on the hero canvas
   ============================================================ */

(function() {
  'use strict';

  // ---- Mini animated maze preview ----
  const canvas = document.getElementById('previewCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const TILE = 32;
  const COLS = W / TILE, ROWS = H / TILE;

  // Simple 10x10 preview maze (1=wall, 0=path)
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

  // Player state
  const player = { x: 1, y: 1, px: TILE, py: TILE, dir: 0, mouthAngle: 0, mouthOpen: true };
  const playerPath = [[1,1],[1,2],[1,3],[2,3],[3,3],[4,3],[4,4],[4,5],[3,5],[2,5],[1,5],[1,6],[1,7],[1,8],[2,8],[3,8],[4,8],[5,8],[5,7],[5,6],[5,5],[6,5],[7,5],[7,4],[7,3],[7,2],[6,2],[5,2],[5,1],[4,1],[3,1],[2,1],[1,1]];
  let playerStep = 0, playerT = 0;

  // Enemy (ghost) state
  const ghost = { x: 7, y: 7, px: 7*TILE+TILE/2, py: 7*TILE+TILE/2, dir: Math.PI, speed: 0.6 };
  const ghostPath = [[7,7],[7,8],[6,8],[5,8],[5,7],[5,6],[6,6],[7,6],[8,6],[8,7],[8,8],[7,8]];
  let ghostStep = 0, ghostT = 0;

  // Dots (pre-placed on path tiles)
  const dots = [];
  for(let r = 0; r < ROWS; r++) {
    for(let c = 0; c < COLS; c++) {
      if(maze[r][c] === 0 && Math.random() < 0.6) {
        dots.push({ x: c, y: r, collected: false, alpha: 1 });
      }
    }
  }

  // Vision cone highlight
  let visionPulse = 0;

  // Lerp helper
  function lerp(a, b, t) { return a + (b - a) * t; }

  function getPos(path, step, t) {
    const a = path[step % path.length];
    const b = path[(step + 1) % path.length];
    return {
      x: lerp(a[1], b[1], t) * TILE + TILE/2,
      y: lerp(a[0], b[0], t) * TILE + TILE/2,
      dir: Math.atan2(b[0]-a[0], b[1]-a[1])
    };
  }

  // Draw a rounded maze wall tile
  function drawWall(c, r) {
    const x = c * TILE, y = r * TILE;
    ctx.fillStyle = '#0d1120';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = 'rgba(0,229,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    // Add inner glow on wall edge
    const grad = ctx.createLinearGradient(x, y, x+TILE, y+TILE);
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
    if(dot.collected) return;
    const x = dot.x * TILE + TILE/2, y = dot.y * TILE + TILE/2;
    ctx.globalAlpha = dot.alpha;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(200,216,240,0.6)';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawVisionCone(gx, gy, dir) {
    const range = 90;
    const angle = Math.PI / 3; // 60 degrees
    visionPulse = (visionPulse + 0.03) % (Math.PI * 2);
    const alpha = 0.12 + Math.sin(visionPulse) * 0.04;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.arc(gx, gy, range, dir - angle/2, dir + angle/2);
    ctx.closePath();
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, range);
    grad.addColorStop(0, `rgba(255,60,172,${alpha * 2})`);
    grad.addColorStop(1, `rgba(255,60,172,0)`);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  function drawGhost(gx, gy, dir) {
    ctx.save();
    ctx.translate(gx, gy);

    // Body
    ctx.beginPath();
    ctx.arc(0, -2, 10, Math.PI, 0, false);
    ctx.lineTo(10, 8);
    ctx.bezierCurveTo(7, 4, 3, 10, 0, 6);
    ctx.bezierCurveTo(-3, 10, -7, 4, -10, 8);
    ctx.closePath();
    ctx.fillStyle = '#ff3cac';
    ctx.shadowColor = '#ff3cac';
    ctx.shadowBlur = 12;
    ctx.fill();

    // Eyes
    const eyeOffX = Math.cos(dir) * 3;
    const eyeOffY = Math.sin(dir) * 3;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-4 + eyeOffX*0.3, -3, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4 + eyeOffX*0.3, -3, 3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-4 + eyeOffX, -3 + eyeOffY*0.5, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4 + eyeOffX, -3 + eyeOffY*0.5, 1.5, 0, Math.PI*2); ctx.fill();

    ctx.restore();
  }

  function drawPlayer(px, py, mouthAngle) {
    ctx.save();
    ctx.translate(px, py);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 11, mouthAngle, Math.PI * 2 - mouthAngle, false);
    ctx.closePath();
    ctx.fillStyle = '#f7c948';
    ctx.shadowColor = '#f7c948';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.restore();
  }

  let last = 0;
  function animate(ts) {
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;

    // Update player
    playerT += dt * 1.8;
    if(playerT >= 1) { playerT -= 1; playerStep = (playerStep + 1) % playerPath.length; }
    const pp = getPos(playerPath, playerStep, playerT);
    player.px = pp.x; player.py = pp.y; player.dir = pp.dir;
    player.mouthAngle = (Math.sin(ts * 0.008) * 0.4 + 0.05);

    // Update ghost
    ghostT += dt * ghostStep < ghostPath.length ? 0.8 : 0.8;
    ghostT += dt * 0.8;
    if(ghostT >= 1) { ghostT -= 1; ghostStep = (ghostStep + 1) % ghostPath.length; }
    const gp = getPos(ghostPath, ghostStep, ghostT);
    ghost.px = gp.x; ghost.py = gp.y; ghost.dir = gp.dir;

    // Check dot collection by player
    dots.forEach(d => {
      if(!d.collected) {
        const dx = d.x*TILE + TILE/2 - player.px;
        const dy = d.y*TILE + TILE/2 - player.py;
        if(Math.sqrt(dx*dx+dy*dy) < 10) {
          d.collected = true;
          // Respawn after a while
          setTimeout(() => { d.collected = false; }, 4000 + Math.random()*3000);
        }
      }
    });

    // ---- Draw ----
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, W, H);

    // Tiles
    for(let r = 0; r < ROWS; r++) {
      for(let c = 0; c < COLS; c++) {
        if(maze[r][c] === 1) drawWall(c, r);
        else drawFloor(c, r);
      }
    }

    // Dots
    dots.forEach(drawDot);

    // Vision cone (behind ghost)
    drawVisionCone(ghost.px, ghost.py, ghost.dir);

    // Ghost
    drawGhost(ghost.px, ghost.py, ghost.dir);

    // Player
    drawPlayer(player.px, player.py, player.mouthAngle);

    // Overlay vignette
    const vig = ctx.createRadialGradient(W/2, H/2, W*0.2, W/2, H/2, W*0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);

  // ---- Entrance animations for feature cards ----
  const cards = document.querySelectorAll('.feature-card');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if(e.isIntersecting) {
        setTimeout(() => {
          e.target.style.opacity = '1';
          e.target.style.transform = 'translateY(0)';
        }, i * 80);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  cards.forEach(c => {
    c.style.opacity = '0';
    c.style.transform = 'translateY(20px)';
    c.style.transition = 'opacity 0.5s ease, transform 0.5s ease, border-color 0.3s, box-shadow 0.3s';
    obs.observe(c);
  });

})();
