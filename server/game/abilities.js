'use strict';

/**
 * Ability catalogue. Damage values are SERVER-AUTHORITATIVE — never trust the client.
 *
 * Damage scale (all values per cast, baseline at level 1):
 *
 *   Tier         Range            Examples
 *   ----         -----            --------
 *   Utility      0 dmg            Phase Shift (movement/stealth)
 *   Light AoE    25 - 60          EMP Pulse
 *   Medium AoE   80 - 200         Black Hole explosion
 *   Burst        60 dmg × 5       Orbital Strike (5 shells)
 *   Sustained    bullet × 1.5×    Hyperfire (4s window)
 *
 * Level scaling: every ability gets `+level × scaleFactor` extra damage.
 * Cooldowns: balanced so a level-20 player can cycle universal every 8s
 *            and a class ult every 20-35s. Same for everyone — fair PvP.
 */

const ABILITY_DEFS = {
  // ---- Universal (slot Q, unlocked from L1 for everyone) ----
  emp: {
    id: 'emp',
    name: 'EMP Pulse',
    slot: 'q',
    classReq: null,        // anyone
    levelReq: 1,
    cooldownMs: 8000,
    radius: 220,
    knockback: 400,
    damage: (lvl) => 25 + lvl * 2,
    color: '#22D3EE',
    description: 'Discharge a shockwave that damages and knocks back everything within 220 units.',
  },

  // ---- Class: Singularity (gravity / area control) ----
  blackhole: {
    id: 'blackhole',
    name: 'Black Hole',
    slot: 'r',
    classReq: 'singularity',
    levelReq: 15,
    cooldownMs: 25000,
    castRange: 600,        // max distance you can place it
    pullRadius: 380,
    pullForcePerSec: 220,
    durationMs: 3000,
    explosionRadius: 260,
    explosionDamage: (lvl) => 80 + lvl * 4,
    color: '#A78BFA',
    description: 'Place a gravity well. Pulls in shapes, bullets, and enemies for 3s, then explodes for massive AoE damage.',
  },

  // ---- Class: Bombardier (ranged burst) ----
  orbitalstrike: {
    id: 'orbitalstrike',
    name: 'Orbital Strike',
    slot: 'r',
    classReq: 'bombardier',
    levelReq: 15,
    cooldownMs: 30000,
    castRange: 1100,
    targetRadius: 360,
    warningMs: 1400,
    shellCount: 5,
    shellRadius: 90,
    damagePerShell: (lvl) => 60 + lvl * 3,
    color: '#FB923C',
    description: 'Mark a target zone. After 1.4s, 5 high-damage shells crash down in random points within 360 units.',
  },

  // ---- Class: Phantom (stealth / mobility) ----
  phaseshift: {
    id: 'phaseshift',
    name: 'Phase Shift',
    slot: 'r',
    classReq: 'phantom',
    levelReq: 15,
    cooldownMs: 20000,
    durationMs: 2200,
    speedMultiplier: 1.85,
    nextShotDamageMultiplier: 2.0,
    color: '#22D3EE',
    description: 'Phase out for 2.2s — invulnerable, 1.85× speed, and your next shot deals 2× damage.',
  },

  // ---- Class: Overdrive (sustained DPS) ----
  hyperfire: {
    id: 'hyperfire',
    name: 'Hyperfire',
    slot: 'r',
    classReq: 'overdrive',
    levelReq: 15,
    cooldownMs: 35000,
    durationMs: 4000,
    reloadMultiplier: 0.35,     // multiplier ON reload (lower = faster)
    damageMultiplier: 1.5,
    color: '#EF4444',
    description: 'Enter rapid-fire mode for 4s — fire 3× faster with 1.5× damage per bullet.',
  },
};

const CLASSES = {
  cosmonaut: {
    id: 'cosmonaut',
    name: 'Cosmonaut',
    color: '#5B8CFF',
    description: 'Balanced starter tank. EMP Pulse only — pick a class at level 15.',
  },
  singularity: {
    id: 'singularity',
    name: 'Singularity',
    color: '#A78BFA',
    description: 'Bends space. Drops gravity wells that crush whatever falls inside.',
    abilities: ['blackhole'],
  },
  bombardier: {
    id: 'bombardier',
    name: 'Bombardier',
    color: '#FB923C',
    description: 'Long-range artillery specialist. Calls down orbital strikes from off-screen.',
    abilities: ['orbitalstrike'],
  },
  phantom: {
    id: 'phantom',
    name: 'Phantom',
    color: '#22D3EE',
    description: 'Phases through bullets. Strikes from the dark, reloads in the cracks.',
    abilities: ['phaseshift'],
  },
  overdrive: {
    id: 'overdrive',
    name: 'Overdrive',
    color: '#EF4444',
    description: 'Pure firepower. Rapid-fire windows turn any cannon into a meat grinder.',
    abilities: ['hyperfire'],
  },
};

function getAbility(id) { return ABILITY_DEFS[id] || null; }
function getClass(id) { return CLASSES[id] || null; }
function abilityForClassSlot(classId, slot) {
  const cls = CLASSES[classId];
  if (!cls || !cls.abilities) return null;
  for (const aid of cls.abilities) {
    const a = ABILITY_DEFS[aid];
    if (a && a.slot === slot) return a;
  }
  return null;
}

module.exports = { ABILITY_DEFS, CLASSES, getAbility, getClass, abilityForClassSlot };
