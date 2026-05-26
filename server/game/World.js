'use strict';

const { Player } = require('./Player');
const { ABILITY_DEFS, CLASSES, abilityForClassSlot, getAbility } = require('./abilities');

const WORLD_SIZE = 4500;
const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;

// Shape spawning targets
const SHAPE_TARGETS = { square: 240, triangle: 90, pentagon: 18 };

// Shape stats: { sides, radius, hp, xp, damage, color }
const SHAPE_DEFS = {
  square:   { sides: 4, radius: 18, hp: 10,  xp: 10,  bodyDmg: 8,  color: '#FACC15' },
  triangle: { sides: 3, radius: 22, hp: 30,  xp: 25,  bodyDmg: 14, color: '#F87171' },
  pentagon: { sides: 5, radius: 36, hp: 100, xp: 130, bodyDmg: 22, color: '#60A5FA' },
};

const RESPAWN_LOCKOUT_MS = 3000;
const MAX_INPUTS_PER_SEC = 90;
const BULLET_RADIUS = 7;
const HEAL_DELAY_MS = 5000;       // time after damage before regen kicks in
const FRICTION = 0.86;            // applied each tick to recoil/knockback

let shapeCounter = 1;
let bulletCounter = 1;
let fxCounter = 1;
function nextFxId() { return fxCounter++; }

class World {
  constructor({ id, name, vipOnly = false }) {
    this.id = id;
    this.name = name;
    this.vipOnly = !!vipOnly;
    this.size = WORLD_SIZE;
    this.players = new Map();
    this.socketToPlayer = new Map();
    this.shapes = new Map();
    this.bullets = new Map();
    this.blackHoles = new Map();      // active gravity wells
    this.strikes = new Map();         // pending orbital strikes
    this.empPulses = [];              // ephemeral visual events (one-tick)
    this.shellHits = [];              // ephemeral visual events (one-tick)
    this.lastTick = Date.now();
    this.events = [];

    for (let i = 0; i < SHAPE_TARGETS.square; i++) this.spawnShape('square');
    for (let i = 0; i < SHAPE_TARGETS.triangle; i++) this.spawnShape('triangle');
    for (let i = 0; i < SHAPE_TARGETS.pentagon; i++) this.spawnShape('pentagon');
  }

  // ---------- Lifecycle ----------

  addPlayer(player) {
    const { x, y } = this.randomSpawn();
    player.reset(x, y);
    this.players.set(player.id, player);
    this.socketToPlayer.set(player.socketId, player.id);
    return player;
  }

  removePlayerBySocket(socketId) {
    const pid = this.socketToPlayer.get(socketId);
    if (!pid) return null;
    const p = this.players.get(pid);
    this.players.delete(pid);
    this.socketToPlayer.delete(socketId);
    return p;
  }

  getPlayerBySocket(socketId) {
    const pid = this.socketToPlayer.get(socketId);
    return pid ? this.players.get(pid) : null;
  }

  respawn(player) {
    const { x, y } = this.randomSpawn();
    player.reset(x, y);
    this.events.push({ type: 'respawn', id: player.id });
  }

  canRespawn(player, now) {
    return !player.alive && now - player.deadAt >= RESPAWN_LOCKOUT_MS;
  }

  // ---------- Input ----------

  applyInput(player, input, now) {
    if (now - player.inputsWindowStart > 1000) {
      player.inputsWindowStart = now;
      player.inputsThisSecond = 0;
    }
    player.inputsThisSecond++;
    if (player.inputsThisSecond > MAX_INPUTS_PER_SEC) return;

    if (!input || typeof input !== 'object') return;

    let mx = Number(input.mx);
    let my = Number(input.my);
    if (Number.isFinite(mx) && Number.isFinite(my)) {
      const mag = Math.hypot(mx, my);
      if (mag > 1) { mx /= mag; my /= mag; }
      player.moveX = mx;
      player.moveY = my;
    }

    const aim = Number(input.aim);
    if (Number.isFinite(aim)) player.aim = aim;

    player.shoot = !!input.shoot;
    if (typeof input.autofire === 'boolean') player.autofire = input.autofire;
    if (typeof input.autospin === 'boolean') player.autospin = input.autospin;
    player.lastInputAt = now;
  }

  upgradeStat(player, stat) {
    return player.tryUpgradeStat(stat);
  }

  // ---------- Class selection ----------

  selectClass(player, classId) {
    if (!CLASSES[classId]) return { ok: false, error: 'Unknown class' };
    if (player.level < 15) return { ok: false, error: 'Reach level 15 first' };
    if (player.tankClass !== 'cosmonaut') return { ok: false, error: 'Class already selected this life' };
    if (classId === 'cosmonaut') return { ok: false, error: 'Pick a real class' };
    player.tankClass = classId;
    this.events.push({ type: 'class_picked', id: player.id, cls: classId });
    return { ok: true };
  }

  // ---------- Ability casting ----------

  castAbility(player, slot, target, now) {
    if (!player.alive) return { ok: false, error: 'dead' };
    if (slot !== 'q' && slot !== 'r') return { ok: false, error: 'bad slot' };
    if (player.cooldowns[slot] > now) return { ok: false, error: 'cooldown' };

    let abil;
    if (slot === 'q') {
      abil = ABILITY_DEFS.emp; // universal
    } else {
      abil = abilityForClassSlot(player.tankClass, 'r');
      if (!abil) return { ok: false, error: 'No R ability — pick a class' };
    }
    if (player.level < (abil.levelReq || 1)) return { ok: false, error: `Need level ${abil.levelReq}` };

    // Validate target if needed (cast range)
    let tx = player.x, ty = player.y;
    if (target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
      tx = target.x; ty = target.y;
      if (abil.castRange) {
        const dx = tx - player.x, dy = ty - player.y;
        const d = Math.hypot(dx, dy);
        if (d > abil.castRange) {
          // clamp to max range
          tx = player.x + (dx / d) * abil.castRange;
          ty = player.y + (dy / d) * abil.castRange;
        }
      }
    }

    // Dispatch
    switch (abil.id) {
      case 'emp':           this.castEMP(player, abil, now); break;
      case 'blackhole':     this.castBlackHole(player, abil, tx, ty, now); break;
      case 'orbitalstrike': this.castOrbitalStrike(player, abil, tx, ty, now); break;
      case 'phaseshift':    this.castPhaseShift(player, abil, now); break;
      case 'hyperfire':     this.castHyperfire(player, abil, now); break;
      default: return { ok: false, error: 'unsupported' };
    }
    player.cooldowns[slot] = now + abil.cooldownMs;
    return { ok: true };
  }

  castEMP(player, abil, now) {
    const dmg = abil.damage(player.level);
    const r2 = abil.radius * abil.radius;
    // damage + knockback all enemies in range
    for (const p of this.players.values()) {
      if (p === player || !p.alive || p.isPhased(now)) continue;
      const dx = p.x - player.x, dy = p.y - player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2) {
        const d = Math.sqrt(d2) || 1;
        const nx = dx / d, ny = dy / d;
        const died = p.takeDamage(dmg, now);
        p.vx += nx * abil.knockback;
        p.vy += ny * abil.knockback;
        p.effects.stunUntil = Math.max(p.effects.stunUntil, now + 300);
        if (died) {
          player.addXP(80 + p.level * 5);
          this.events.push({ type: 'killed', victim: p.id, killer: player.id, ability: 'emp' });
        }
      }
    }
    // damage shapes too
    for (const [sid, s] of this.shapes) {
      const dx = s.x - player.x, dy = s.y - player.y;
      if (dx * dx + dy * dy < r2) {
        s.hp -= dmg;
        if (s.hp <= 0) {
          const def = SHAPE_DEFS[s.type];
          this.shapes.delete(sid);
          player.addXP(def.xp);
        }
      }
    }
    // visual marker for clients (one-tick)
    this.empPulses.push({ id: nextFxId(), x: player.x, y: player.y, r: abil.radius, t: now });
  }

  castBlackHole(player, abil, x, y, now) {
    const id = nextFxId();
    this.blackHoles.set(id, {
      id,
      ownerId: player.id,
      x, y,
      bornAt: now,
      explodesAt: now + abil.durationMs,
      pullRadius: abil.pullRadius,
      pullForce: abil.pullForcePerSec,
      explosionRadius: abil.explosionRadius,
      explosionDamage: abil.explosionDamage(player.level),
    });
    this.events.push({ type: 'blackhole_cast', x, y });
  }

  castOrbitalStrike(player, abil, x, y, now) {
    const id = nextFxId();
    // Pre-generate the shell positions so all clients see the same fall
    const shells = [];
    for (let i = 0; i < abil.shellCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * abil.targetRadius;
      shells.push({
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        landsAt: now + abil.warningMs + i * 80, // slight stagger
        radius: abil.shellRadius,
        damage: abil.damagePerShell(player.level),
        landed: false,
      });
    }
    this.strikes.set(id, {
      id,
      ownerId: player.id,
      x, y,
      warningUntil: now + abil.warningMs,
      targetRadius: abil.targetRadius,
      shells,
      doneAt: now + abil.warningMs + (abil.shellCount * 80) + 200,
    });
    this.events.push({ type: 'strike_cast', x, y });
  }

  castPhaseShift(player, abil, now) {
    player.effects.phaseShiftUntil = now + abil.durationMs;
    player.effects.phaseShotBonusUntil = now + abil.durationMs + 1500;
    // tiny heal as the "phase out" effect
    player.hp = Math.min(player.maxHp, player.hp + 20);
  }

  castHyperfire(player, abil, now) {
    player.effects.hyperfireUntil = now + abil.durationMs;
  }

  // ---------- Tick step: black holes & strikes ----------

  tickAbilityEntities(now, dt) {
    // Black holes
    for (const [id, bh] of this.blackHoles) {
      // Pull entities in
      const pullR2 = bh.pullRadius * bh.pullRadius;
      const tickPull = bh.pullForce * dt;
      for (const p of this.players.values()) {
        if (!p.alive || p.isPhased(now)) continue;
        const dx = bh.x - p.x, dy = bh.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < pullR2 && d2 > 100) {
          const d = Math.sqrt(d2);
          p.vx += (dx / d) * tickPull;
          p.vy += (dy / d) * tickPull;
        }
      }
      for (const s of this.shapes.values()) {
        const dx = bh.x - s.x, dy = bh.y - s.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < pullR2 && d2 > 100) {
          const d = Math.sqrt(d2);
          s.vx += (dx / d) * tickPull * 0.5;
          s.vy += (dy / d) * tickPull * 0.5;
        }
      }
      for (const b of this.bullets.values()) {
        const dx = bh.x - b.x, dy = bh.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < pullR2 && d2 > 100) {
          const d = Math.sqrt(d2);
          b.vx += (dx / d) * tickPull * 1.2;
          b.vy += (dy / d) * tickPull * 1.2;
        }
      }

      // Explode at end of life
      if (now >= bh.explodesAt) {
        const r2 = bh.explosionRadius * bh.explosionRadius;
        const owner = this.players.get(bh.ownerId);
        for (const p of this.players.values()) {
          if (!p.alive || p.isPhased(now)) continue;
          // owners can hurt themselves with black hole — intentional risk
          const dx = p.x - bh.x, dy = p.y - bh.y;
          if (dx * dx + dy * dy < r2) {
            const died = p.takeDamage(bh.explosionDamage, now);
            // knockback outward
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            p.vx += (dx / d) * 350;
            p.vy += (dy / d) * 350;
            if (died) {
              if (owner && owner.alive && owner !== p) {
                owner.addXP(80 + p.level * 5);
              }
              this.events.push({ type: 'killed', victim: p.id, killer: bh.ownerId, ability: 'blackhole' });
            }
          }
        }
        for (const [sid, s] of this.shapes) {
          const dx = s.x - bh.x, dy = s.y - bh.y;
          if (dx * dx + dy * dy < r2) {
            s.hp -= bh.explosionDamage * 0.5;
            if (s.hp <= 0) {
              this.shapes.delete(sid);
              if (owner && owner.alive) owner.addXP(SHAPE_DEFS[s.type].xp);
            }
          }
        }
        this.events.push({ type: 'blackhole_explode', x: bh.x, y: bh.y, r: bh.explosionRadius });
        this.blackHoles.delete(id);
      }
    }

    // Orbital strikes
    for (const [id, strike] of this.strikes) {
      for (const shell of strike.shells) {
        if (shell.landed) continue;
        if (now >= shell.landsAt) {
          shell.landed = true;
          const r2 = shell.radius * shell.radius;
          const owner = this.players.get(strike.ownerId);
          for (const p of this.players.values()) {
            if (!p.alive || p.isPhased(now)) continue;
            const dx = p.x - shell.x, dy = p.y - shell.y;
            if (dx * dx + dy * dy < r2) {
              const died = p.takeDamage(shell.damage, now);
              if (died) {
                if (owner && owner.alive && owner !== p) {
                  owner.addXP(80 + p.level * 5);
                }
                this.events.push({ type: 'killed', victim: p.id, killer: strike.ownerId, ability: 'orbitalstrike' });
              }
            }
          }
          for (const [sid, s] of this.shapes) {
            const dx = s.x - shell.x, dy = s.y - shell.y;
            if (dx * dx + dy * dy < r2) {
              s.hp -= shell.damage * 0.6;
              if (s.hp <= 0) {
                this.shapes.delete(sid);
                if (owner && owner.alive) owner.addXP(SHAPE_DEFS[s.type].xp);
              }
            }
          }
          this.shellHits.push({ id: nextFxId(), x: shell.x, y: shell.y, r: shell.radius, t: now });
        }
      }
      if (now >= strike.doneAt) this.strikes.delete(id);
    }
  }

  // ---------- Tick ----------

  step() {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    this.tickPlayers(now, dt);
    this.tickShapes(dt);
    this.tickBullets(now, dt);
    this.tickAbilityEntities(now, dt);
    this.collisions(now);
    this.regen(now, dt);
    this.respawnShapes();
  }

  tickPlayers(now, dt) {
    for (const p of this.players.values()) {
      if (!p.alive) continue;

      // movement
      let sp = p.speed;
      if (p.isPhased(now)) sp *= 1.85;
      if (p.isStunned(now)) sp *= 0.4;
      p.vx = p.vx * FRICTION + p.moveX * sp * (1 - FRICTION);
      p.vy = p.vy * FRICTION + p.moveY * sp * (1 - FRICTION);
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // aim — autospin spins the barrel; otherwise follow input aim
      if (p.autospin) {
        p.heading = (p.heading + 6 * dt) % (Math.PI * 2);
      } else {
        p.heading = p.aim;
      }

      // shooting
      p.cooldown -= dt * 1000;
      const wantsShoot = p.shoot || p.autofire || p.autospin;
      if (wantsShoot && p.cooldown <= 0 && !p.isStunned(now)) {
        this.fireBullet(p, now);
        // Hyperfire shrinks reload
        const reloadMul = p.isHyperfiring(now) ? 0.35 : 1;
        p.cooldown = p.reloadMs * reloadMul;
      }

      // clamp to world
      if (p.x < p.radius) { p.x = p.radius; p.vx = 0; }
      if (p.y < p.radius) { p.y = p.radius; p.vy = 0; }
      if (p.x > this.size - p.radius) { p.x = this.size - p.radius; p.vx = 0; }
      if (p.y > this.size - p.radius) { p.y = this.size - p.radius; p.vy = 0; }
    }
  }

  fireBullet(p, now) {
    const tipDist = p.radius * 1.2;
    const bx = p.x + Math.cos(p.heading) * tipDist;
    const by = p.y + Math.sin(p.heading) * tipDist;
    const vx = Math.cos(p.heading) * p.bulletSpeed;
    const vy = Math.sin(p.heading) * p.bulletSpeed;
    const id = bulletCounter++;

    // Damage multipliers from active effects
    let dmgMul = 1;
    if (p.isHyperfiring(now)) dmgMul *= 1.5;
    if (now < p.effects.phaseShotBonusUntil) {
      dmgMul *= 2.0;
      p.effects.phaseShotBonusUntil = 0; // consume bonus
    }

    this.bullets.set(id, {
      id,
      ownerId: p.id,
      x: bx,
      y: by,
      vx, vy,
      r: BULLET_RADIUS + 0.5 * p.stats.bulletDamage,
      damage: p.bulletDamage * dmgMul,
      pen: p.bulletPenetration,
      hits: 0,
      ttl: now + p.bulletTtlMs,
      // visual flag — let client paint these differently
      special: dmgMul > 1.4,
    });
    // recoil
    p.vx -= Math.cos(p.heading) * 60;
    p.vy -= Math.sin(p.heading) * 60;
  }

  tickShapes(dt) {
    for (const s of this.shapes.values()) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rotation += s.rotSpeed * dt;
      // bounce off walls
      const def = SHAPE_DEFS[s.type];
      if (s.x < def.radius || s.x > this.size - def.radius) s.vx *= -1;
      if (s.y < def.radius || s.y > this.size - def.radius) s.vy *= -1;
      // gradual healing
      if (s.hp < def.hp) s.hp = Math.min(def.hp, s.hp + def.hp * 0.05 * dt);
    }
  }

  tickBullets(now, dt) {
    for (const [id, b] of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // expire
      if (now > b.ttl || b.hits >= b.pen) {
        this.bullets.delete(id);
        continue;
      }
      // out of world
      if (b.x < -50 || b.y < -50 || b.x > this.size + 50 || b.y > this.size + 50) {
        this.bullets.delete(id);
      }
    }
  }

  collisions(now) {
    // bullets vs shapes
    for (const [bid, b] of this.bullets) {
      for (const [sid, s] of this.shapes) {
        const def = SHAPE_DEFS[s.type];
        const dx = s.x - b.x, dy = s.y - b.y;
        const rsum = b.r + def.radius;
        if (dx * dx + dy * dy < rsum * rsum) {
          s.hp -= b.damage;
          b.hits++;
          // knock the shape
          const ang = Math.atan2(dy, dx);
          s.vx += Math.cos(ang) * 50;
          s.vy += Math.sin(ang) * 50;
          if (s.hp <= 0) {
            this.shapes.delete(sid);
            const owner = this.players.get(b.ownerId);
            if (owner && owner.alive) owner.addXP(def.xp);
          }
          if (b.hits >= b.pen) {
            this.bullets.delete(bid);
            break;
          }
        }
      }
    }

    // bullets vs players (excluding owner)
    for (const [bid, b] of this.bullets) {
      for (const p of this.players.values()) {
        if (!p.alive || p.id === b.ownerId) continue;
        if (p.isPhased(now)) continue; // phantoms ignore bullets
        const dx = p.x - b.x, dy = p.y - b.y;
        const rsum = b.r + p.radius;
        if (dx * dx + dy * dy < rsum * rsum) {
          const died = p.takeDamage(b.damage, now);
          b.hits++;
          // knock player
          const ang = Math.atan2(dy, dx);
          p.vx += Math.cos(ang) * 30;
          p.vy += Math.sin(ang) * 30;
          if (died) {
            const owner = this.players.get(b.ownerId);
            if (owner && owner.alive) {
              owner.addXP(80 + Math.floor(p.level * 5 + p.totalScore * 0.10));
            }
            this.events.push({ type: 'killed', victim: p.id, killer: b.ownerId });
          }
          if (b.hits >= b.pen) { this.bullets.delete(bid); break; }
        }
      }
    }

    // players vs shapes (body damage both ways)
    const playerArr = [...this.players.values()].filter((p) => p.alive);
    for (const p of playerArr) {
      for (const [sid, s] of this.shapes) {
        const def = SHAPE_DEFS[s.type];
        const dx = p.x - s.x, dy = p.y - s.y;
        const d = Math.hypot(dx, dy);
        const rsum = p.radius + def.radius;
        if (d < rsum) {
          const overlap = rsum - d;
          const nx = dx / (d || 1), ny = dy / (d || 1);
          // separate
          p.x += nx * overlap * 0.6;
          p.y += ny * overlap * 0.6;
          s.x -= nx * overlap * 0.4;
          s.y -= ny * overlap * 0.4;
          // damage exchange (per second-style)
          const tickDmg = 0.6;
          s.hp -= p.bodyDamage * tickDmg;
          p.takeDamage(def.bodyDmg * tickDmg, now);
          if (s.hp <= 0) {
            this.shapes.delete(sid);
            if (p.alive) p.addXP(def.xp);
          }
          if (!p.alive) {
            this.events.push({ type: 'killed_by_shape', victim: p.id, shape: s.type });
            break;
          }
        }
      }
    }

    // player vs player body collision
    for (let i = 0; i < playerArr.length; i++) {
      const a = playerArr[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < playerArr.length; j++) {
        const b = playerArr[j];
        if (!b.alive) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        const rsum = a.radius + b.radius;
        if (d < rsum) {
          const overlap = rsum - d;
          const nx = dx / (d || 1), ny = dy / (d || 1);
          a.x += nx * overlap * 0.5;
          a.y += ny * overlap * 0.5;
          b.x -= nx * overlap * 0.5;
          b.y -= ny * overlap * 0.5;
          const tickDmg = 0.5;
          const aDmg = a.takeDamage(b.bodyDamage * tickDmg, now);
          const bDmg = b.takeDamage(a.bodyDamage * tickDmg, now);
          if (!a.alive) {
            if (b.alive) b.addXP(80 + a.level * 5);
            this.events.push({ type: 'killed', victim: a.id, killer: b.id });
          }
          if (!b.alive) {
            if (a.alive) a.addXP(80 + b.level * 5);
            this.events.push({ type: 'killed', victim: b.id, killer: a.id });
          }
        }
      }
    }
  }

  regen(now, dt) {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.hp >= p.maxHp) continue;
      if (now - p.lastDamagedAt < HEAL_DELAY_MS) continue;
      p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
    }
  }

  respawnShapes() {
    for (const [type, target] of Object.entries(SHAPE_TARGETS)) {
      let count = 0;
      for (const s of this.shapes.values()) if (s.type === type) count++;
      while (count < target) {
        this.spawnShape(type);
        count++;
      }
    }
  }

  // ---------- World queries ----------

  randomSpawn() {
    for (let t = 0; t < 15; t++) {
      const x = 200 + Math.random() * (this.size - 400);
      const y = 200 + Math.random() * (this.size - 400);
      let ok = true;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (Math.hypot(p.x - x, p.y - y) < 300) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return { x: Math.random() * this.size, y: Math.random() * this.size };
  }

  spawnShape(type) {
    const id = shapeCounter++;
    const def = SHAPE_DEFS[type];
    this.shapes.set(id, {
      id,
      type,
      x: def.radius + Math.random() * (this.size - 2 * def.radius),
      y: def.radius + Math.random() * (this.size - 2 * def.radius),
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.6,
      hp: def.hp,
    });
  }

  viewportSnapshot(viewer, viewW = 1800, viewH = 1300) {
    const halfW = viewW / 2 + 200;
    const halfH = viewH / 2 + 200;
    const inView = (x, y) => Math.abs(x - viewer.x) < halfW && Math.abs(y - viewer.y) < halfH;

    const players = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (inView(p.x, p.y)) players.push(p.snapshot());
    }
    const shapes = [];
    for (const s of this.shapes.values()) {
      if (inView(s.x, s.y)) {
        const def = SHAPE_DEFS[s.type];
        shapes.push({
          id: s.id,
          t: s.type[0], // 's','t','p'
          x: Math.round(s.x),
          y: Math.round(s.y),
          rot: Math.round(s.rotation * 1000) / 1000,
          hp: Math.round(s.hp),
          maxHp: def.hp,
        });
      }
    }
    const bullets = [];
    for (const b of this.bullets.values()) {
      if (inView(b.x, b.y)) {
        bullets.push({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), r: b.r, o: b.ownerId, sp: b.special ? 1 : 0 });
      }
    }
    const blackHoles = [];
    for (const bh of this.blackHoles.values()) {
      if (inView(bh.x, bh.y)) {
        blackHoles.push({
          id: bh.id,
          x: Math.round(bh.x), y: Math.round(bh.y),
          pr: bh.pullRadius, er: bh.explosionRadius,
          life: Math.max(0, bh.explodesAt - Date.now()),
          max: bh.explodesAt - bh.bornAt,
        });
      }
    }
    const strikes = [];
    for (const st of this.strikes.values()) {
      if (inView(st.x, st.y)) {
        strikes.push({
          id: st.id,
          x: Math.round(st.x), y: Math.round(st.y),
          tr: st.targetRadius,
          wu: Math.max(0, st.warningUntil - Date.now()),
        });
      }
    }
    return {
      t: Date.now(),
      self: viewer.selfSnapshot(),
      players,
      shapes,
      bullets,
      blackHoles,
      strikes,
      fx: { emp: this.empPulses, shells: this.shellHits },
      leaderboard: this.leaderboard(),
      events: this.events.slice(),
      world: this.size,
    };
  }

  leaderboard(limit = 10) {
    return [...this.players.values()]
      .filter((p) => p.alive)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit)
      .map((p) => ({ name: p.name, score: p.totalScore, lvl: p.level, vip: p.isVip }));
  }

  clearEvents() {
    this.events.length = 0;
    this.empPulses.length = 0;
    this.shellHits.length = 0;
  }
}

module.exports = { World, TICK_MS, TICK_RATE, WORLD_SIZE, SHAPE_DEFS };
