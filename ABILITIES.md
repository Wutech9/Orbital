# Orbital — Ability + Class reference

All damage values are **server-authoritative** and scale linearly with player level. Cooldowns are identical for every player — fair PvP.

## Damage scale

| Tier        | Range at L1 | Per-level | Notes                                |
|-------------|-------------|-----------|--------------------------------------|
| Utility     | 0           | —         | Phase Shift (stealth/speed only)     |
| Light AoE   | 25          | +2/level  | EMP Pulse                            |
| Medium AoE  | 80          | +4/level  | Black Hole explosion                 |
| Burst       | 60 × 5      | +3/level  | Orbital Strike (5 shells)            |
| Sustained   | bullet × 1.5 | implicit | Hyperfire window (4s)                |

Worked example at L20:
- EMP Pulse → 65 dmg
- Black Hole explosion → 160 dmg
- Orbital Strike per shell → 120 dmg, max ~600 dmg if all 5 connect
- Hyperfire bullet → your normal bullet damage × 1.5 (compounds with bulletDamage stat)

## Controls

| Key       | Action                                  |
|-----------|-----------------------------------------|
| **Q**     | Universal ability — **EMP Pulse**       |
| **R**     | Class ability (unlocked at L15)         |
| Click ability slots in HUD | Cast (alt to keyboard)     |

## Classes

You start as **Cosmonaut** (no class). At level 15 a class-selection modal appears — your choice is permanent until you die.

### Cosmonaut (default)
Balanced. EMP Pulse only.

### 🟣 Singularity
- **Color:** purple
- **Ability:** Black Hole (R) — 25s cooldown, 600 unit cast range
- **What it does:** Drops a gravity well at the cursor. For 3 seconds it pulls in tanks, bullets, and shapes within 380 units. Then explodes for `80 + 4 × level` damage in a 260-unit radius. **The explosion damages you too** if you stand in it — use the pull window to position yourself outside.
- **Counters:** Phase Shift (immune to pull), distance.

### 🟠 Bombardier
- **Color:** orange
- **Ability:** Orbital Strike (R) — 30s cooldown, 1100 unit cast range
- **What it does:** Marks a 360-unit target zone with a pulsing crosshair. After 1.4 seconds, 5 shells crash down in random positions inside the zone, each dealing `60 + 3 × level` damage in a 90-unit blast. Max realistic damage if all shells hit the same target: ~300 + 15 × level.
- **Counters:** Movement — the warning gives ~1.4s to leave the zone.

### 🟦 Phantom
- **Color:** cyan
- **Ability:** Phase Shift (R) — 20s cooldown
- **What it does:** Phase out for 2.2 seconds. Invulnerable to bullets, gravity, and EMPs. Your move speed is multiplied by 1.85×. The **first bullet** you fire within 3.7s of activation deals **2× damage**. Small 20 HP heal on activation.
- **Counters:** Body-slam damage still applies during phase. Use to escape, not to bull-rush.

### 🔴 Overdrive
- **Color:** red
- **Ability:** Hyperfire (R) — 35s cooldown
- **What it does:** For 4 seconds, your reload is multiplied by 0.35 (≈3× faster fire) and every bullet deals 1.5× damage. Stacks with your bulletDamage stat.
- **Counters:** Distance. They have to be in range to shoot you. Black Hole pulls them off-line.

## Universal: EMP Pulse (Q)

- **Cooldown:** 8 seconds — usable from level 1
- **Damage:** `25 + 2 × level`
- **Radius:** 220 units (centered on your tank, not mouse)
- **Effect:** Damages AND knocks back AND briefly stuns (0.3s) everything in range. Hits shapes too.
- **Tip:** Cast right before someone tries to body-slam you — they bounce off, you survive.

## Implementation notes (for devs)

Source files:
- `server/game/abilities.js` — single source of truth for cooldowns / damage formulas
- `server/game/World.js` — `castAbility`, `castBlackHole`, `tickAbilityEntities`, etc.
- `server/game/Player.js` — `tankClass`, `cooldowns`, `effects` (phase/hyperfire/stun)
- `public/js/game.js` — HUD rendering + visual effects + Q/R key bindings

The client only emits *intent* — `socket.emit('ability', { slot:'q', target:{x,y} })`. The server validates cooldown, level, range, and applies damage. **Never trust client damage values.**
