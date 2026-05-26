(function () {
  'use strict';

  // ============================================================
  // Orbital — diep.io-style tank shooter
  //
  // Controls (matched to diep.io):
  //   W / A / S / D / ↑ ↓ ← →   — move the tank
  //   Mouse                      — aim the cannon
  //   Left click  /  Space       — shoot
  //   E                          — toggle auto-fire
  //   C                          — toggle auto-spin
  //   1..8                       — upgrade a stat
  //   F                          — toggle fullscreen
  //   Enter                      — confirm respawn
  // ============================================================

  // ---------- Ability catalogue (client) ----------
  const CLASSES = [
    { id:'singularity', name:'Singularity', color:'#A78BFA', ability:'Black Hole',
      desc:'Drop a gravity well. Pulls enemies in for 3s, then explodes.', stats:'AoE control · 25s CD' },
    { id:'bombardier',  name:'Bombardier',  color:'#FB923C', ability:'Orbital Strike',
      desc:'Mark a zone. 5 shells crash down for high burst damage.', stats:'Long range · 30s CD' },
    { id:'phantom',     name:'Phantom',     color:'#22D3EE', ability:'Phase Shift',
      desc:'Phase out — invulnerable, faster, next shot deals 2× damage.', stats:'Escape + alpha · 20s CD' },
    { id:'overdrive',   name:'Overdrive',   color:'#EF4444', ability:'Hyperfire',
      desc:'Rapid-fire for 4s — 3× reload speed, 1.5× bullet damage.', stats:'Burst DPS · 35s CD' },
  ];
  const ABILITY_NAMES = {
    emp:'EMP Pulse', blackhole:'Black Hole', orbitalstrike:'Orbital Strike',
    phaseshift:'Phase Shift', hyperfire:'Hyperfire',
  };
  const CLASS_R_ABILITY = {
    singularity:'blackhole', bombardier:'orbitalstrike',
    phantom:'phaseshift', overdrive:'hyperfire',
  };

  const STATS = ['healthRegen','maxHealth','bodyDamage','bulletSpeed','bulletPenetration','bulletDamage','reload','movementSpeed'];
  const STAT_LABELS = {
    healthRegen:'Health Regen', maxHealth:'Max Health', bodyDamage:'Body Damage',
    bulletSpeed:'Bullet Speed', bulletPenetration:'Bullet Penetration',
    bulletDamage:'Bullet Damage', reload:'Reload', movementSpeed:'Movement Speed',
  };
  const STAT_COLORS = {
    healthRegen:'#10B981', maxHealth:'#3B82F6', bodyDamage:'#F87171',
    bulletSpeed:'#A78BFA', bulletPenetration:'#FBBF24',
    bulletDamage:'#EF4444', reload:'#22D3EE', movementSpeed:'#F472B6',
  };

  // -------- Setup --------
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const minimap = document.getElementById('minimap');
  const mctx = minimap.getContext('2d');
  const deathOverlay = document.getElementById('death-overlay');
  const respawnBtn = document.getElementById('respawn-btn');
  const respawnCountdown = document.getElementById('respawn-countdown');
  const hudScore = document.getElementById('hud-score');
  const hudMass = document.getElementById('hud-mass'); // repurposed as LEVEL
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

  // Repurpose the HUD mass label as "LEVEL"
  const massLabel = hudMass?.previousElementSibling;
  if (massLabel) massLabel.textContent = 'Level';

  // -------- Socket --------
  const socket = io({ transports: ['websocket'] });

  let lastState = null;
  let prevState = null;
  let lastStateAt = 0;
  let prevStateAt = 0;
  let myId = null;
  let worldSize = 4500;
  let dead = false;

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
      hudMass.textContent = s.self.lvl;
      renderStatBar(s.self);
      renderAbilityHud(s.self);
      maybeShowClassModal(s.self);
      if (!s.self.alive && !dead) {
        dead = true;
        showDeathOverlay(s.self);
      } else if (s.self.alive && dead) {
        dead = false;
        deathOverlay.classList.remove('show');
        classModalShown = false; // re-allow class pick after respawn
      }
    }

    if (Array.isArray(s.leaderboard)) {
      hudLeaderboard.innerHTML = s.leaderboard.map((p, i) =>
        `<li class="${p.vip ? 'vip' : ''}">${p.vip ? '★ ' : ''}${escapeHtml(p.name)} <span style="color:var(--muted); float:right;">L${p.lvl} · ${p.score}</span></li>`
      ).join('');
    }
  });

  function showDeathOverlay(self) {
    deathOverlay.classList.add('show');
    respawnBtn.disabled = true;
    const finalScore = self.score || 0;
    const finalLevel = self.lvl || 1;
    const heading = deathOverlay.querySelector('h2');
    if (heading) heading.textContent = 'You were destroyed';
    const fact = deathOverlay.querySelector('#death-fact');
    if (fact) fact.textContent = `Reached level ${finalLevel} · scored ${finalScore}`;
    setupShareLinks(self, finalLevel, finalScore);
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const remain = Math.max(0, 3000 - elapsed);
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

  function setupShareLinks(self, lvl, score) {
    const user = window.Auth?.getUser?.();
    const ref = user ? `?ref=${encodeURIComponent(user.username)}` : '';
    const shareUrl = `${location.origin}/${ref}`;
    const text = `I reached level ${lvl} with ${score} points in Orbital — a free multiplayer tank io game. Beat my score:`;
    const enc = encodeURIComponent;
    const t = document.getElementById('share-twitter');
    const r = document.getElementById('share-reddit');
    const f = document.getElementById('share-facebook');
    const tg = document.getElementById('share-telegram');
    if (t)  t.href  = `https://twitter.com/intent/tweet?text=${enc(text + ' ' + shareUrl)}`;
    if (r)  r.href  = `https://www.reddit.com/submit?url=${enc(shareUrl)}&title=${enc(text)}`;
    if (f)  f.href  = `https://www.facebook.com/sharer/sharer.php?u=${enc(shareUrl)}&quote=${enc(text)}`;
    if (tg) tg.href = `https://t.me/share/url?url=${enc(shareUrl)}&text=${enc(text)}`;
    const copy = document.getElementById('share-copy');
    if (copy && !copy._wired) {
      copy._wired = true;
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(`${text} ${shareUrl}`);
          copy.textContent = '✓';
          setTimeout(() => { copy.textContent = '🔗'; }, 1400);
        } catch {
          prompt('Copy this:', `${text} ${shareUrl}`);
        }
      });
    }
  }

  // -------- Input --------
  const keys = Object.create(null);
  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let mouseShoot = false;
  let autofire = false;
  let autospin = false;

  canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) mouseShoot = true; });
  canvas.addEventListener('mouseup',   (e) => { if (e.button === 0) mouseShoot = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // touch
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches[0]) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; mouseShoot = true; }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches[0]) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', () => { mouseShoot = false; });

  function castAbility(slot) {
    if (!lastState || !lastState.self) return;
    // Use current world mouse position as target
    const worldTarget = screenToWorld(mouse.x, mouse.y);
    socket.emit('ability', { slot, target: worldTarget }, (res) => {
      if (res && !res.ok) {
        showToast(res.error || 'Cannot cast');
      }
    });
  }

  function screenToWorld(sx, sy) {
    if (!lastState || !lastState.self) return null;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return {
      x: lastState.self.x + (sx - cx),
      y: lastState.self.y + (sy - cy),
    };
  }

  let toastTimer = 0;
  function showToast(text) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.style.cssText = 'position:fixed;top:20%;left:50%;transform:translateX(-50%);background:rgba(8,10,22,0.92);border:1px solid var(--panel-border);color:var(--text);padding:10px 16px;border-radius:8px;font-size:14px;z-index:300;pointer-events:none;opacity:0;transition:opacity .15s;';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1400);
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;

    if (e.code === 'KeyE') { autofire = !autofire; }
    else if (e.code === 'KeyC') { autospin = !autospin; }
    else if (e.code === 'KeyQ') { castAbility('q'); }
    else if (e.code === 'KeyR') { castAbility('r'); }
    else if (e.code === 'KeyF' && document.fullscreenEnabled) {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    }
    else if (e.code === 'Enter' && dead && !respawnBtn.disabled) respawnBtn.click();
    else if (/^Digit[1-8]$/.test(e.code)) {
      const idx = parseInt(e.code.slice(5), 10) - 1;
      socket.emit('upgrade', STATS[idx]);
    }
  });

  // Click ability slots to cast too
  document.querySelectorAll('.ability-slot').forEach((el) => {
    el.addEventListener('click', () => castAbility(el.dataset.slot));
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  function moveVector() {
    let mx = 0, my = 0;
    if (keys['KeyW'] || keys['ArrowUp']) my -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) my += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
    const mag = Math.hypot(mx, my);
    if (mag > 0) { mx /= mag; my /= mag; }
    return { mx, my };
  }

  // Send input at 30Hz
  setInterval(() => {
    if (!myId || !lastState || !lastState.self) return;
    const { mx, my } = moveVector();
    // aim is angle from screen center to mouse (player is centered)
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const aim = Math.atan2(mouse.y - cy, mouse.x - cx);
    const shoot = mouseShoot || !!keys['Space'];
    socket.emit('input', { mx, my, aim, shoot, autofire, autospin });
  }, 33);

  // -------- Stat upgrade panel --------
  let statBarsBuilt = false;
  function renderStatBar(self) {
    const wrap = document.getElementById('stat-bar');
    if (!wrap) return;
    if (!statBarsBuilt) {
      wrap.innerHTML = STATS.map((stat, i) => `
        <div class="stat-row" data-stat="${stat}">
          <div class="stat-label">${i + 1}. ${STAT_LABELS[stat]}</div>
          <div class="stat-pips"></div>
          <button class="stat-plus" aria-label="upgrade">+</button>
        </div>
      `).join('');
      // wire up + buttons
      wrap.querySelectorAll('.stat-row').forEach((row) => {
        row.querySelector('.stat-plus').addEventListener('click', () => {
          socket.emit('upgrade', row.dataset.stat);
        });
      });
      statBarsBuilt = true;
    }
    // refresh pip fill + plus enabled state
    STATS.forEach((stat) => {
      const row = wrap.querySelector(`.stat-row[data-stat="${stat}"]`);
      if (!row) return;
      const lvl = self.stats?.[stat] || 0;
      const pips = row.querySelector('.stat-pips');
      const cells = pips.children;
      if (cells.length !== 7) {
        pips.innerHTML = '';
        for (let i = 0; i < 7; i++) {
          const c = document.createElement('span');
          c.className = 'stat-pip';
          pips.appendChild(c);
        }
      }
      for (let i = 0; i < 7; i++) {
        pips.children[i].style.background = i < lvl ? STAT_COLORS[stat] : 'transparent';
      }
      const plus = row.querySelector('.stat-plus');
      plus.disabled = !(self.statPoints > 0 && lvl < 7);
      plus.style.background = plus.disabled ? '#1f2740' : STAT_COLORS[stat];
    });
    const points = document.getElementById('stat-points');
    if (points) points.textContent = `${self.statPoints || 0} points`;
    // autofire / autospin indicators
    const ai = document.getElementById('autofire-indicator');
    const si = document.getElementById('autospin-indicator');
    if (ai) ai.style.display = (autofire || self.autofire) ? '' : 'none';
    if (si) si.style.display = (autospin || self.autospin) ? '' : 'none';
  }

  // -------- Ability HUD + class modal --------
  function renderAbilityHud(self) {
    const now = Date.now();
    const cdQ = Math.max(0, (self.cooldowns?.q || 0) - now);
    const cdR = Math.max(0, (self.cooldowns?.r || 0) - now);
    const slots = document.querySelectorAll('.ability-slot');
    slots.forEach((el) => {
      const slot = el.dataset.slot;
      const cd = slot === 'q' ? cdQ : cdR;
      const nameEl = el.querySelector('.ability-name');
      const cdEl = el.querySelector('.ability-cd');
      if (slot === 'q') {
        nameEl.textContent = 'EMP Pulse';
        el.classList.remove('locked');
      } else {
        const cls = self.cls;
        const aid = CLASS_R_ABILITY[cls];
        if (aid) {
          nameEl.textContent = ABILITY_NAMES[aid];
          el.classList.remove('locked');
        } else if ((self.lvl || 1) < 15) {
          nameEl.textContent = `Pick class @ L15`;
          el.classList.add('locked');
        } else {
          nameEl.textContent = 'Pick class (R)';
          el.classList.remove('locked');
        }
      }
      if (cd > 0) {
        el.classList.add('cd-active');
        el.classList.remove('ready');
        cdEl.textContent = (cd / 1000).toFixed(cd < 10000 ? 1 : 0) + 's';
      } else {
        el.classList.remove('cd-active');
        if (!el.classList.contains('locked')) el.classList.add('ready');
        else el.classList.remove('ready');
      }
    });
  }

  let classModalShown = false;
  function maybeShowClassModal(self) {
    if (classModalShown) return;
    if (self.alive && self.lvl >= 15 && (!self.cls || self.cls === 'cosmonaut')) {
      classModalShown = true;
      showClassModal();
    }
  }

  function showClassModal() {
    const modal = document.getElementById('class-modal');
    const grid = modal.querySelector('.class-grid');
    grid.innerHTML = '';
    CLASSES.forEach((c) => {
      const card = document.createElement('div');
      card.className = 'class-card';
      card.style.borderColor = c.color;
      card.style.boxShadow = `0 0 0 0 ${c.color}`;
      card.innerHTML = `
        <div class="class-name" style="color:${c.color}">${c.name}</div>
        <div class="class-ability">${c.ability}</div>
        <p>${c.desc}</p>
        <div class="class-stats">${c.stats}</div>
      `;
      card.addEventListener('mouseenter', () => { card.style.boxShadow = `0 0 24px ${c.color}55`; });
      card.addEventListener('mouseleave', () => { card.style.boxShadow = `0 0 0 0 ${c.color}`; });
      card.addEventListener('click', () => {
        socket.emit('select_class', c.id, (res) => {
          if (res && res.ok) {
            modal.style.display = 'none';
            showToast(`${c.name} chosen — press R or click to use ${c.ability}`);
          } else if (res && res.error) {
            showToast(res.error);
          }
        });
      });
      grid.appendChild(card);
    });
    modal.style.display = 'flex';
  }

  // -------- Render --------
  function interp() {
    if (!lastState) return null;
    if (!prevState) return lastState;
    const t = (performance.now() - lastStateAt) / Math.max(16, lastStateAt - prevStateAt);
    const a = Math.max(0, Math.min(1, t + 1));
    const mapPrev = new Map(prevState.players.map((p) => [p.id, p]));
    const mergedPlayers = lastState.players.map((p) => {
      const pp = mapPrev.get(p.id);
      if (!pp) return p;
      return {
        ...p,
        x: pp.x + (p.x - pp.x) * a,
        y: pp.y + (p.y - pp.y) * a,
        h: lerpAngle(pp.h, p.h, a),
      };
    });
    let self = lastState.self;
    if (prevState.self && self) {
      const ps = prevState.self;
      self = {
        ...self,
        x: ps.x + (self.x - ps.x) * a,
        y: ps.y + (self.y - ps.y) * a,
        h: lerpAngle(ps.h, self.h, a),
      };
    }
    // bullets — quick lerp by id
    const mapPrevB = new Map((prevState.bullets || []).map((b) => [b.id, b]));
    const mergedBullets = (lastState.bullets || []).map((b) => {
      const pp = mapPrevB.get(b.id);
      if (!pp) return b;
      return { ...b, x: pp.x + (b.x - pp.x) * a, y: pp.y + (b.y - pp.y) * a };
    });
    return { ...lastState, players: mergedPlayers, self, bullets: mergedBullets };
  }
  function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return a + diff * t;
  }

  function render() {
    requestAnimationFrame(render);
    const s = interp();
    if (!s || !s.self) return;

    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0e1c';
    ctx.fillRect(0, 0, W, H);

    const camX = s.self.x;
    const camY = s.self.y;

    drawGrid(camX, camY, W, H);

    ctx.setTransform(dpr, 0, 0, dpr, W / 2 - camX * dpr, H / 2 - camY * dpr);

    // world boundary
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.6)';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, worldSize, worldSize);

    // shapes
    for (const sh of s.shapes || []) drawShape(sh);

    // black holes (under tanks)
    for (const bh of s.blackHoles || []) drawBlackHole(bh);
    // strike warning circles (under tanks)
    for (const st of s.strikes || []) drawStrikeWarning(st);

    // players (others first, self last)
    const others = s.players.filter((p) => p.id !== s.self.id);
    others.push(s.self);
    for (const p of others) drawTank(p);

    // bullets
    for (const b of s.bullets || []) drawBullet(b, s.self.id);

    // ephemeral fx (over everything)
    if (s.fx) {
      for (const pulse of s.fx.emp || []) drawEmpRing(pulse);
      for (const hit of s.fx.shells || []) drawShellHit(hit);
    }
  }

  function drawBlackHole(bh) {
    const r = bh.pr;
    // pulsating event horizon
    const t = (performance.now() / 200) % (Math.PI * 2);
    ctx.save();
    // outer pull aura
    const grad = ctx.createRadialGradient(bh.x, bh.y, 8, bh.x, bh.y, r);
    grad.addColorStop(0, 'rgba(167, 139, 250, 0.55)');
    grad.addColorStop(0.6, 'rgba(124, 58, 237, 0.18)');
    grad.addColorStop(1, 'rgba(15, 4, 30, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(bh.x, bh.y, r, 0, Math.PI * 2); ctx.fill();
    // event horizon
    ctx.beginPath();
    ctx.arc(bh.x, bh.y, 22 + Math.sin(t) * 3, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0014';
    ctx.fill();
    ctx.strokeStyle = '#A78BFA';
    ctx.lineWidth = 3;
    ctx.stroke();
    // rotating accretion ring
    ctx.beginPath();
    ctx.arc(bh.x, bh.y, 50 + Math.sin(t * 2) * 4, t * 0.6, t * 0.6 + Math.PI * 1.6);
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function drawStrikeWarning(st) {
    const warn = st.wu > 0;
    ctx.save();
    // pulsing target circle
    const t = (performance.now() / 200) % (Math.PI * 2);
    const pulse = 0.5 + Math.sin(t * 4) * 0.5;
    ctx.strokeStyle = warn ? `rgba(251, 146, 60, ${0.4 + pulse * 0.5})` : 'rgba(251, 146, 60, 0.15)';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 8]);
    ctx.beginPath(); ctx.arc(st.x, st.y, st.tr, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // crosshair
    ctx.strokeStyle = `rgba(251, 146, 60, ${0.5 + pulse * 0.5})`;
    ctx.beginPath();
    ctx.moveTo(st.x - 30, st.y); ctx.lineTo(st.x + 30, st.y);
    ctx.moveTo(st.x, st.y - 30); ctx.lineTo(st.x, st.y + 30);
    ctx.stroke();
    ctx.restore();
  }

  function drawEmpRing(pulse) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pulse.x, pulse.y, pulse.r, 0, Math.PI * 2);
    ctx.strokeStyle = '#22D3EE';
    ctx.lineWidth = 8;
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#22D3EE';
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(pulse.x, pulse.y, pulse.r * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  function drawShellHit(hit) {
    ctx.save();
    // expanding flash
    const grad = ctx.createRadialGradient(hit.x, hit.y, 8, hit.x, hit.y, hit.r);
    grad.addColorStop(0, 'rgba(255, 240, 200, 0.95)');
    grad.addColorStop(0.4, 'rgba(251, 146, 60, 0.6)');
    grad.addColorStop(1, 'rgba(127, 29, 29, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(hit.x, hit.y, hit.r, 0, Math.PI * 2); ctx.fill();
    // bright core
    ctx.fillStyle = '#FED7AA';
    ctx.beginPath(); ctx.arc(hit.x, hit.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawGrid(camX, camY, W, H) {
    const gridSize = 50 * dpr;
    const startX = -((camX * dpr) % gridSize);
    const startY = -((camY * dpr) % gridSize);
    ctx.strokeStyle = 'rgba(120, 140, 200, 0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX + W / 2; x < W; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let x = startX + W / 2; x > 0; x -= gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = startY + H / 2; y < H; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    for (let y = startY + H / 2; y > 0; y -= gridSize) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function skinColor(skin) {
    switch (skin) {
      case 'skin-azure':      return { fill: '#3B82F6', stroke: '#1d4ed8' };
      case 'skin-crimson':    return { fill: '#EF4444', stroke: '#991b1b' };
      case 'skin-emerald':    return { fill: '#10B981', stroke: '#065f46' };
      case 'skin-prism': {
        const t = (performance.now() / 20) % 360;
        return { fill: `hsl(${t}, 80%, 55%)`, stroke: `hsl(${t}, 80%, 35%)` };
      }
      case 'skin-vip-nebula': return { fill: '#a78bfa', stroke: '#5b21b6' };
      default:                return { fill: '#5B8CFF', stroke: '#1F3A8A' };
    }
  }

  function drawTank(p) {
    const c = skinColor(p.skin);
    const isMe = p.id === lastState?.self?.id;
    const phased = !!p.ph;
    const hyperfire = !!p.hf;

    // global alpha for phase
    const prevAlpha = ctx.globalAlpha;
    if (phased) ctx.globalAlpha = 0.45;

    // hyperfire aura
    if (hyperfire) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
      ctx.fill();
    }

    // barrel
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.h || 0);
    const barrelLen = p.r * 1.7;
    const barrelW = p.r * 0.6;
    ctx.fillStyle = hyperfire ? '#EF4444' : '#888EA0';
    ctx.strokeStyle = '#333A4E';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(0, -barrelW / 2, barrelLen, barrelW);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // body — class color overrides default skin if cls != cosmonaut
    let bodyFill = c.fill, bodyStroke = c.stroke;
    if (p.cls && p.cls !== 'cosmonaut') {
      const cm = CLASSES.find((x) => x.id === p.cls);
      if (cm) { bodyFill = cm.color; bodyStroke = '#111827'; }
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = bodyFill;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = bodyStroke;
    ctx.stroke();

    // restore alpha for HUD text
    ctx.globalAlpha = prevAlpha;

    // VIP crown
    if (p.vip || p.badge === 'crown-gold') drawCrown(p.x, p.y - p.r - 18, p.r * 0.5);
    else if (p.badge && p.badge !== 'none') drawBadge(p.x + p.r * 0.85, p.y - p.r * 0.85, 7, p.badge);

    // name + level
    ctx.font = `bold ${Math.max(13, p.r * 0.5)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#fff' : '#E5E9F5';
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.fillText(`${p.name || 'Player'}`, p.x, p.y - p.r - 26);
    ctx.font = `${Math.max(11, p.r * 0.36)}px Inter, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`Lvl ${p.lvl}`, p.x, p.y - p.r - 10);
    ctx.shadowBlur = 0;

    // HP bar (only show if damaged)
    if (p.hp < p.maxHp) {
      const barW = p.r * 2;
      const barH = 6;
      const x = p.x - barW / 2;
      const y = p.y + p.r + 8;
      ctx.fillStyle = '#222';
      ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(x, y, barW * Math.max(0, p.hp / p.maxHp), barH);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, barW, barH);
    }
  }

  function drawShape(s) {
    const colors = { s: { fill: '#FACC15', stroke: '#A16207' }, t: { fill: '#F87171', stroke: '#991B1B' }, p: { fill: '#60A5FA', stroke: '#1E3A8A' } };
    const radii  = { s: 18, t: 22, p: 36 };
    const sides  = { s: 4, t: 3, p: 5 };
    const r = radii[s.t];
    const n = sides[s.t];
    const c = colors[s.t];
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot || 0);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = c.stroke;
    ctx.stroke();
    ctx.restore();
    // hp bar when damaged
    if (s.hp < s.maxHp) {
      const w = r * 2;
      ctx.fillStyle = '#222';
      ctx.fillRect(s.x - w / 2, s.y + r + 6, w, 4);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(s.x - w / 2, s.y + r + 6, w * Math.max(0, s.hp / s.maxHp), 4);
    }
  }

  function drawBullet(b, myPid) {
    if (b.sp) {
      // special (hyperfire / phase-bonus) — orange glow
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#FB923C';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 2, 0, Math.PI * 2);
      ctx.fillStyle = '#FED7AA';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#9A3412';
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = b.o === myPid ? '#60A5FA' : '#F87171';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = b.o === myPid ? '#1E3A8A' : '#7F1D1D';
    ctx.stroke();
  }

  function drawCrown(x, y, size) {
    ctx.save();
    ctx.fillStyle = '#FBBF24';
    ctx.strokeStyle = '#92400E';
    ctx.lineWidth = 1.5;
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
    mctx.beginPath();
    mctx.arc(lastState.self.x * sx, lastState.self.y * sy, 3.5, 0, Math.PI * 2);
    mctx.fillStyle = '#22D3EE';
    mctx.fill();
  }
  renderMinimap();
  render();
})();
