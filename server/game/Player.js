'use strict';

const BASE_RADIUS = 22;
const MAX_NAME_LEN = 16;
const MAX_LEVEL = 45;

// Stat caps (mirrors diep.io 0-7 per stat, max 33 total points spent)
const MAX_STAT_LEVEL = 7;
const STATS = ['healthRegen', 'maxHealth', 'bodyDamage', 'bulletSpeed', 'bulletPenetration', 'bulletDamage', 'reload', 'movementSpeed'];

// XP needed to go from level L to level L+1. Matches diep.io's escalating curve loosely.
function xpToNext(level) {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.floor(4 * Math.pow(1.16, level));
}

// Stat points awarded per level (diep.io: 1 per level 1-28, then every 3 to 45)
function statPointsForLevel(level) {
  if (level <= 28) return 1;
  if ((level - 28) % 3 === 0) return 1;
  return 0;
}

class Player {
  constructor({ id, name, socketId, userId = null, isVip = false, skin = 'default', trail = 'none', badge = 'none' }) {
    this.id = id;
    this.socketId = socketId;
    this.userId = userId;
    this.isVip = !!isVip;
    this.name = sanitizeName(name);

    this.skin = sanitizeCosmetic(skin) || 'default';
    this.trail = sanitizeCosmetic(trail) || 'none';
    this.badge = sanitizeCosmetic(badge) || 'none';

    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.radius = BASE_RADIUS;
    this.heading = 0;         // barrel direction, radians

    // Combat
    this.hp = 100;
    this.maxHp = 100;
    this.regen = 0.10;        // hp/sec (base)
    this.lastDamagedAt = 0;
    this.cooldown = 0;        // ms until next shot

    // Progression
    this.level = 1;
    this.xp = 0;
    this.xpToNext = xpToNext(1);
    this.totalScore = 0;
    this.statPoints = 0;
    this.stats = Object.fromEntries(STATS.map((s) => [s, 0]));

    this.alive = true;
    this.deadAt = 0;

    // Class + abilities
    this.tankClass = 'cosmonaut';      // 'cosmonaut' | 'singularity' | 'bombardier' | 'phantom' | 'overdrive'
    this.cooldowns = { q: 0, r: 0 };   // ms until ability ready
    this.effects = {
      phaseShiftUntil: 0,
      hyperfireUntil: 0,
      phaseShotBonusUntil: 0,
      stunUntil: 0,
    };

    // Input intent
    this.moveX = 0;
    this.moveY = 0;
    this.aim = 0;
    this.shoot = false;
    this.autofire = false;
    this.autospin = false;

    // Anti-cheat / rate limit
    this.lastInputAt = 0;
    this.inputsThisSecond = 0;
    this.inputsWindowStart = 0;
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = BASE_RADIUS;
    this.heading = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.regen = 0.10;
    this.lastDamagedAt = 0;
    this.cooldown = 0;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = xpToNext(1);
    this.totalScore = 0;
    this.statPoints = 0;
    this.stats = Object.fromEntries(STATS.map((s) => [s, 0]));
    this.alive = true;
    this.deadAt = 0;
    this.autofire = false;
    this.autospin = false;
    this.tankClass = 'cosmonaut';
    this.cooldowns.q = 0;
    this.cooldowns.r = 0;
    this.effects.phaseShiftUntil = 0;
    this.effects.hyperfireUntil = 0;
    this.effects.phaseShotBonusUntil = 0;
    this.effects.stunUntil = 0;
    this.recomputeDerived();
  }

  /** Recompute speed / damage / etc. from stat allocations and level. */
  recomputeDerived() {
    // Body grows ~0.3% per level
    this.radius = BASE_RADIUS * (1 + (this.level - 1) * 0.012);
    // HP scales with maxHealth stat and level
    const prevPct = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.maxHp = 50 + 20 * this.level + 20 * this.stats.maxHealth;
    this.hp = Math.min(this.maxHp, prevPct * this.maxHp || this.maxHp);
    // Regen scales with healthRegen stat (hp/sec while not recently damaged)
    this.regen = 0.05 + 0.30 * this.stats.healthRegen + this.maxHp * 0.0005;
  }

  addXP(amount) {
    if (!this.alive) return;
    this.totalScore += amount;
    if (this.isVip) amount = Math.floor(amount * 1.10);
    this.xp += amount;
    while (this.level < MAX_LEVEL && this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.statPoints += statPointsForLevel(this.level);
      this.xpToNext = xpToNext(this.level);
      this.recomputeDerived();
    }
    if (this.level >= MAX_LEVEL) {
      this.xp = 0;
      this.xpToNext = Infinity;
    }
  }

  takeDamage(amount, now) {
    this.hp -= amount;
    this.lastDamagedAt = now;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deadAt = now;
      return true;
    }
    return false;
  }

  tryUpgradeStat(stat) {
    if (this.statPoints <= 0) return false;
    if (!STATS.includes(stat)) return false;
    if (this.stats[stat] >= MAX_STAT_LEVEL) return false;
    this.stats[stat]++;
    this.statPoints--;
    this.recomputeDerived();
    return true;
  }

  // ---- Derived gameplay numbers ----
  get speed() {
    // base 230 px/s, +6% per movementSpeed point, slightly slower at high level
    const levelDrag = Math.max(0.7, 1 - (this.level - 1) * 0.008);
    return 230 * (1 + 0.07 * this.stats.movementSpeed) * levelDrag;
  }
  get bodyDamage() {
    return 18 + 6 * this.stats.bodyDamage + this.level * 0.6;
  }
  get bulletDamage() {
    return 7 + 3 * this.stats.bulletDamage + this.level * 0.4;
  }
  get bulletSpeed() {
    return 440 + 35 * this.stats.bulletSpeed;
  }
  get bulletPenetration() {
    return 5 + 4 * this.stats.bulletPenetration;
  }
  get reloadMs() {
    // base 600ms, -8% per point (min 150ms)
    return Math.max(150, 600 * Math.pow(0.91, this.stats.reload));
  }
  get bulletTtlMs() {
    return 1100 + 40 * this.stats.bulletSpeed;
  }

  snapshot() {
    return {
      id: this.id,
      name: this.name,
      x: round(this.x),
      y: round(this.y),
      r: round(this.radius),
      h: round(this.heading, 1000),
      hp: round(this.hp),
      maxHp: round(this.maxHp),
      lvl: this.level,
      skin: this.skin,
      trail: this.trail,
      badge: this.badge,
      vip: this.isVip,
      alive: this.alive,
      cls: this.tankClass,
      // tell others if visually phased
      ph: this.isPhased(Date.now()) ? 1 : 0,
      hf: this.isHyperfiring(Date.now()) ? 1 : 0,
    };
  }

  selfSnapshot() {
    const s = this.snapshot();
    s.xp = round(this.xp);
    s.xpToNext = this.xpToNext;
    s.statPoints = this.statPoints;
    s.stats = { ...this.stats };
    s.score = this.totalScore;
    s.autofire = this.autofire;
    s.autospin = this.autospin;
    s.cooldowns = { q: Math.max(0, this.cooldowns.q), r: Math.max(0, this.cooldowns.r) };
    return s;
  }

  isPhased(now) { return now < this.effects.phaseShiftUntil; }
  isHyperfiring(now) { return now < this.effects.hyperfireUntil; }
  isStunned(now) { return now < this.effects.stunUntil; }
}

function sanitizeName(raw) {
  if (typeof raw !== 'string') return 'Player';
  let s = raw.replace(/[ -<>&"'`\\]/g, '').trim();
  if (!s) s = 'Player';
  if (s.length > MAX_NAME_LEN) s = s.slice(0, MAX_NAME_LEN);
  return s;
}

function sanitizeCosmetic(raw) {
  if (typeof raw !== 'string') return null;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(raw)) return null;
  return raw;
}

function round(n, mult = 100) {
  return Math.round(n * mult) / mult;
}

module.exports = { Player, sanitizeName, sanitizeCosmetic, STATS, MAX_STAT_LEVEL, MAX_LEVEL };
