(function () {
  'use strict';

  // -------- Setup --------
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const minimap = document.getElementById('minimap');
  const mctx = minimap.getContext('2d');
  const deathOverlay = document.getElementById('death-overlay');
  const respawnBtn = document.getElementById('respawn-btn');
  const respawnCountdown = document.getElementById('respawn-countdown');
  const hudScore = document.getElementById('hud-score');
  const hudMass = document.getElementById('hud-mass');
  const hudLeaderboard = document.getElementById('hud-leaderboard');

  const params = new URLSearchParams(location.search);
  const roomId = params.get('room') || 'us-east';
  const code = params.get('code');
  const submittedName = params.get('name') || '';

  let dpr = Math.max(1, window.devicePixelRatio || 1);
  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  // -------- Socket --------
  const socket = io({ transports: ['websocket'] });

  // Interpolation buffers
  let lastState = null;
  let prevState = null;
  let lastStateAt = 0;
  let prevStateAt = 0;
  let myId = null;
  let worldSize = 4000;
  let dead = false;
  let deathAt = 0;

  function join() {
    const token = window.Auth?.getToken?.() || null;
    const payload = code
      ? { name: submittedName, customCode: code, token }
      : { name: submittedName, roomId, token };
    socket.emit('join', payload, (resp) => {
      if (!resp || resp.error) {
        alert((resp && resp.error) || 'Failed to join');
        location.href = '/';
        return;
      }
      myId = resp.playerId;
      worldSize = resp.worldSize;
    });
  }

  socket.on('connect', join);
  socket.on('error_msg', (m) => alert(m));

  socket.on('state', (s) => {
    prevState = lastState;
    prevStateAt = lastStateAt;
    lastState = s;
    lastStateAt = performance.now();

    if (s.self) {
      hudScore.textContent = s.self.score;
      hudMass.textContent = Math.round(Math.PI * s.self.r * s.self.r);
      if (!s.self.alive && !dead) {
        dead = true;
        deathAt = performance.now();
        showDeathOverlay();
      } else if (s.self.alive && dead) {
        dead = false;
        deathOverlay.classList.remove('show');
      }
    }

    if (Array.isArray(s.leaderboard)) {
      hudLeaderboard.innerHTML = s.leaderboard.map((p, i) =>
        `<li class="${p.vip ? 'vip' : ''}">${p.vip ? '★ ' : ''}${escapeHtml(p.name)} <span style="float:right; color:var(--muted);">${p.score}</span></li>`
      ).join('');
    }
  });

  function showDeathOverlay() {
    deathOverlay.classList.add('show');
    respawnBtn.disabled = true;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const remain = Math.max(0, 5000 - elapsed);
      if (remain > 0) {
        respawnCountdown.textContent = `Respawn in ${Math.ceil(remain / 1000)}s`;
        requestAnimationFrame(tick);
      } else {
        respawnCountdown.textContent = 'Ready';
        respawnBtn.disabled = false;
      }
    };
    tick();
  }

  respawnBtn.addEventListener('click', () => {
    socket.emit('respawn');
    deathOverlay.classList.remove('show');
  });

  // -------- Input --------
  const mouse = { x: 0, y: 0 };
  let boost = false;

  canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 2) boost = true; });
  canvas.addEventListener('mouseup',   (e) => { if (e.button === 2) boost = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // touch: drag-relative
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches[0]) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches[0]) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') boost = true;
    if (e.code === 'KeyF' && document.fullscreenEnabled) {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    }
    if (e.code === 'Enter' && dead && !respawnBtn.disabled) {
      respawnBtn.click();
    }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') boost = false; });

  // Send input at 30Hz
  setInterval(() => {
    if (!myId || !lastState || !lastState.self) return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    let dx = mouse.x - cx;
    let dy = mouse.y - cy;
    const mag = Math.hypot(dx, dy);
    if (mag > 80) { dx /= mag; dy /= mag; }
    else { dx /= 80; dy /= 80; }
    socket.emit('input', { dx, dy, boost });
  }, 33);

  // -------- Render --------
  function interp() {
    if (!lastState) return null;
    if (!prevState) return lastState;
    const t = (performance.now() - lastStateAt) / Math.max(16, lastStateAt - prevStateAt);
    const a = Math.max(0, Math.min(1, t + 1)); // simple smoothing
    // Build a merged snapshot of players by id
    const mapPrev = new Map(prevState.players.map((p) => [p.id, p]));
    const mergedPlayers = lastState.players.map((p) => {
      const pp = mapPrev.get(p.id);
      if (!pp) return p;
      return {
        ...p,
        x: pp.x + (p.x - pp.x) * a,
        y: pp.y + (p.y - pp.y) * a,
        r: pp.r + (p.r - pp.r) * a,
      };
    });
    let self = lastState.self;
    if (prevState.self && self) {
      self = {
        ...self,
        x: prevState.self.x + (self.x - prevState.self.x) * a,
        y: prevState.self.y + (self.y - prevState.self.y) * a,
        r: prevState.self.r + (self.r - prevState.self.r) * a,
      };
    }
    return { ...lastState, players: mergedPlayers, self };
  }

  function render() {
    requestAnimationFrame(render);
    const s = interp();
    if (!s || !s.self) return;

    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Background grid
    const camX = s.self.x;
    const camY = s.self.y;
    ctx.fillStyle = '#03040a';
    ctx.fillRect(0, 0, W, H);
    drawGrid(camX, camY, W, H);

    ctx.setTransform(dpr, 0, 0, dpr, W / 2 - camX * dpr, H / 2 - camY * dpr);

    // World bounds
    ctx.strokeStyle = 'rgba(124, 92, 255, 0.4)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, worldSize, worldSize);

    // Stardust
    for (const d of s.dust) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#fde68a';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#fde68a';
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Players
    // include self at the end so it renders on top
    const allPlayers = s.players.filter((p) => p.id !== s.self.id);
    allPlayers.push(s.self);
    for (const p of allPlayers) drawPlayer(p);

    // Death overlay handled separately via dom
  }

  function drawGrid(camX, camY, W, H) {
    const gridSize = 80 * dpr;
    const startX = -((camX * dpr) % gridSize);
    const startY = -((camY * dpr) % gridSize);
    ctx.strokeStyle = 'rgba(120, 140, 220, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX + W / 2; x < W; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let x = startX + W / 2; x > 0; x -= gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = startY + H / 2; y < H; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    for (let y = startY + H / 2; y > 0; y -= gridSize) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function skinColor(skin, baseHue = 200) {
    switch (skin) {
      case 'skin-azure':      return { fill: '#3B82F6', glow: '#1d4ed8' };
      case 'skin-crimson':    return { fill: '#EF4444', glow: '#991b1b' };
      case 'skin-emerald':    return { fill: '#10B981', glow: '#065f46' };
      case 'skin-prism': {
        const t = (performance.now() / 20) % 360;
        return { fill: `hsl(${t}, 90%, 60%)`, glow: `hsl(${(t+60)%360}, 90%, 50%)` };
      }
      case 'skin-vip-nebula': return { fill: '#a78bfa', glow: '#7c3aed' };
      default:                return { fill: `hsl(${baseHue}, 80%, 60%)`, glow: `hsl(${baseHue}, 80%, 45%)` };
    }
  }

  function drawPlayer(p) {
    const c = skinColor(p.skin, idHue(p.id));

    // trail
    if (p.trail && p.trail !== 'none') {
      const tColor = p.trail === 'trail-flame' ? '#FB923C' : '#F9FAFB';
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = tColor;
      ctx.filter = 'blur(8px)';
      ctx.fill();
      ctx.restore();
    }

    // body
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = c.fill;
    ctx.shadowBlur = 24;
    ctx.shadowColor = c.glow;
    ctx.fill();
    ctx.shadowBlur = 0;

    // outline ring
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.stroke();

    // VIP crown
    if (p.vip || p.badge === 'crown-gold') {
      drawCrown(p.x, p.y - p.r - 14, p.r * 0.5);
    } else if (p.badge && p.badge !== 'none') {
      drawBadge(p.x + p.r * 0.8, p.y - p.r * 0.8, 8, p.badge);
    }

    // hat
    if (p.skin === 'hat-tophat') drawTopHat(p.x, p.y - p.r, p.r);

    // name
    ctx.font = `bold ${Math.max(11, p.r * 0.42)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.fillText(p.name || 'Player', p.x, p.y + 4);
    ctx.shadowBlur = 0;
  }

  function drawCrown(x, y, size) {
    ctx.save();
    ctx.fillStyle = '#FBBF24';
    ctx.strokeStyle = '#92400E';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - size, y + size);
    ctx.lineTo(x - size, y);
    ctx.lineTo(x - size / 2, y + size / 2);
    ctx.lineTo(x, y - size / 2);
    ctx.lineTo(x + size / 2, y + size / 2);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x + size, y + size);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawBadge(x, y, r, badge) {
    const colors = { 'badge-silver': '#C0C0C0', 'badge-cyan': '#22D3EE' };
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = colors[badge] || '#888';
    ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#222'; ctx.stroke();
  }

  function drawTopHat(x, y, r) {
    ctx.save();
    ctx.fillStyle = '#111827';
    ctx.fillRect(x - r * 0.5, y - r * 0.1, r, r * 0.15);
    ctx.fillRect(x - r * 0.3, y - r * 0.7, r * 0.6, r * 0.6);
    ctx.restore();
  }

  function idHue(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
    return h % 360;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // -------- Minimap --------
  function renderMinimap() {
    requestAnimationFrame(renderMinimap);
    if (!lastState || !lastState.self) return;
    const w = minimap.width, h = minimap.height;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = '#070a18';
    mctx.fillRect(0, 0, w, h);
    mctx.strokeStyle = 'rgba(124, 92, 255, 0.5)';
    mctx.strokeRect(1, 1, w - 2, h - 2);
    const sx = w / worldSize, sy = h / worldSize;
    for (const p of lastState.players) {
      mctx.beginPath();
      mctx.arc(p.x * sx, p.y * sy, 2, 0, Math.PI * 2);
      mctx.fillStyle = p.vip ? '#FBBF24' : '#7c5cff';
      mctx.fill();
    }
    // self
    mctx.beginPath();
    mctx.arc(lastState.self.x * sx, lastState.self.y * sy, 3, 0, Math.PI * 2);
    mctx.fillStyle = '#22D3EE';
    mctx.fill();
  }
  renderMinimap();

  render();
})();
