'use strict';

const { Player } = require('./Player');

const WORLD_SIZE = 4000;
const TICK_RATE = 30; // server ticks per second
const TICK_MS = 1000 / TICK_RATE;
const STARDUST_TARGET = 600;
const STARDUST_RADIUS = 6;
const STARDUST_MASS = 70;
const BASE_SPEED = 220; // px/sec
const BOOST_MULT = 1.85;
const BOOST_DRAIN_PER_SEC = 90; // mass drained
const PASSIVE_DECAY_PER_SEC = 0.012; // 1.2% mass / sec for large players
const PASSIVE_DECAY_THRESHOLD = 8000;
const EAT_OVERLAP_RATIO = 0.6;     // must overlap by 60% of smaller radius
const EAT_SIZE_RATIO = 1.20;       // bigger must be 20% larger
const RESPAWN_LOCKOUT_MS = 5000;
const MAX_INPUTS_PER_SEC = 60;

let stardustCounter = 1;

class World {
  /**
   * @param {object} opts
   * @param {string} opts.id        room id ("us-east", "eu-west", or custom code)
   * @param {string} opts.name      display name
   * @param {boolean} [opts.vipOnly]
   */
  constructor({ id, name, vipOnly = false }) {
    this.id = id;
    this.name = name;
    this.vipOnly = !!vipOnly;
    this.size = WORLD_SIZE;
    this.players = new Map();           // playerId -> Player
    this.socketToPlayer = new Map();    // socketId -> playerId
    this.stardust = new Map();          // id -> {id,x,y}
    this.lastTick = Date.now();
    this.events = [];                   // queued one-shot events for next broadcast

    for (let i = 0; i < STARDUST_TARGET; i++) this.spawnStardust();
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

  // ---------- Input ----------

  applyInput(player, input, now) {
    // rate limit
    if (now - player.inputsWindowStart > 1000) {
      player.inputsWindowStart = now;
      player.inputsThisSecond = 0;
    }
    player.inputsThisSecond++;
    if (player.inputsThisSecond > MAX_INPUTS_PER_SEC) return; // drop

    if (!input || typeof input !== 'object') return;
    let dx = Number(input.dx);
    let dy = Number(input.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    // normalize, clamp magnitude to 1
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    if (mag === 0) { dx = 0; dy = 0; }
    player.targetDx = dx;
    player.targetDy = dy;
    player.boost = !!input.boost;
    player.lastInputAt = now;
  }

  // ---------- Tick ----------

  step() {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    // Move + boost drain + decay
    for (const p of this.players.values()) {
      if (!p.alive) continue;

      // speed scales (slightly) inversely with size so giants don't outrun food
      let speed = BASE_SPEED * (1 - Math.min(0.55, (p.radius - 18) * 0.0035));
      if (p.boost && p.mass > 600) {
        speed *= BOOST_MULT;
        p.setMass(p.mass - BOOST_DRAIN_PER_SEC * dt);
      }
      p.vx = p.targetDx * speed;
      p.vy = p.targetDy * speed;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // passive decay for very large players
      if (p.mass > PASSIVE_DECAY_THRESHOLD) {
        p.setMass(p.mass * (1 - PASSIVE_DECAY_PER_SEC * dt));
      }

      // clamp to world
      if (p.x < p.radius) p.x = p.radius;
      if (p.y < p.radius) p.y = p.radius;
      if (p.x > this.size - p.radius) p.x = this.size - p.radius;
      if (p.y > this.size - p.radius) p.y = this.size - p.radius;
    }

    // Eat stardust
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (const [sid, s] of this.stardust) {
        const dx = s.x - p.x;
        const dy = s.y - p.y;
        const r2 = p.radius * p.radius;
        if (dx * dx + dy * dy < r2) {
          this.stardust.delete(sid);
          let gained = STARDUST_MASS;
          if (p.isVip) gained = Math.floor(gained * 1.10); // VIP 10% boost
          p.setMass(p.mass + gained);
          p.score += Math.floor(gained / 10);
        }
      }
    }

    // Respawn stardust to target
    while (this.stardust.size < STARDUST_TARGET) this.spawnStardust();

    // Player vs player
    const arr = [...this.players.values()].filter((p) => p.alive);
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        if (!b.alive) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        const big = a.radius >= b.radius ? a : b;
        const small = big === a ? b : a;
        if (d < big.radius - small.radius * EAT_OVERLAP_RATIO &&
            big.radius / small.radius >= EAT_SIZE_RATIO) {
          big.setMass(big.mass + small.mass * 0.85);
          big.score += Math.floor(small.score / 4) + 20;
          small.alive = false;
          small.deadAt = now;
          this.events.push({ type: 'eaten', victim: small.id, killer: big.id });
        }
      }
    }
  }

  canRespawn(player, now) {
    return !player.alive && now - player.deadAt >= RESPAWN_LOCKOUT_MS;
  }

  // ---------- World queries ----------

  randomSpawn() {
    // try to avoid spawning on top of other players
    for (let t = 0; t < 10; t++) {
      const x = 200 + Math.random() * (this.size - 400);
      const y = 200 + Math.random() * (this.size - 400);
      let ok = true;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (Math.hypot(p.x - x, p.y - y) < 200) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return { x: Math.random() * this.size, y: Math.random() * this.size };
  }

  spawnStardust() {
    const id = stardustCounter++;
    this.stardust.set(id, {
      id,
      x: Math.random() * this.size,
      y: Math.random() * this.size,
    });
  }

  /** Snapshot scoped to a single player's view (culled by radius). */
  viewportSnapshot(viewer, viewW = 1600, viewH = 1200) {
    const halfW = viewW / 2 + 100;
    const halfH = viewH / 2 + 100;
    const players = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (Math.abs(p.x - viewer.x) < halfW && Math.abs(p.y - viewer.y) < halfH) {
        players.push(p.snapshot());
      }
    }
    const dust = [];
    for (const s of this.stardust.values()) {
      if (Math.abs(s.x - viewer.x) < halfW && Math.abs(s.y - viewer.y) < halfH) {
        dust.push({ id: s.id, x: Math.round(s.x), y: Math.round(s.y) });
      }
    }
    const leaderboard = this.leaderboard();
    const events = this.events.filter((e) =>
      e.type === 'respawn' ||
      e.victim === viewer.id ||
      e.killer === viewer.id ||
      true
    );
    return {
      t: Date.now(),
      self: viewer.snapshot(),
      players,
      dust,
      leaderboard,
      events,
      world: this.size,
    };
  }

  leaderboard(limit = 10) {
    return [...this.players.values()]
      .filter((p) => p.alive)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((p) => ({ name: p.name, score: p.score, vip: p.isVip }));
  }

  clearEvents() {
    this.events.length = 0;
  }
}

module.exports = { World, TICK_MS, TICK_RATE, WORLD_SIZE };
