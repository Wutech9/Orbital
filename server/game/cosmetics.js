'use strict';

/**
 * Cosmetic catalogue. The shop, profile, and game renderer all reference these IDs.
 * Prices are in cents. The "vip" flag means only VIP members can equip it (they get it free).
 */
const CATALOG = [
  // ---- Skins ----
  { id: 'skin-azure',      type: 'skin',  name: 'Azure Glow',     price: 199, color: '#3B82F6' },
  { id: 'skin-crimson',    type: 'skin',  name: 'Crimson Pulse',  price: 199, color: '#EF4444' },
  { id: 'skin-emerald',    type: 'skin',  name: 'Emerald Aura',   price: 299, color: '#10B981' },
  { id: 'skin-prism',      type: 'skin',  name: 'Prismatic',      price: 299, color: 'prism' },
  { id: 'skin-vip-nebula', type: 'skin',  name: 'Nebula (VIP)',   price: 0,   color: 'nebula', vip: true },

  // ---- Trails ----
  { id: 'trail-sparkle', type: 'trail', name: 'Sparkle Trail', price: 299, color: '#F9FAFB' },
  { id: 'trail-flame',   type: 'trail', name: 'Flame Trail',   price: 299, color: '#FB923C' },

  // ---- Badges ----
  { id: 'badge-silver', type: 'badge', name: 'Silver Badge', price: 199, color: '#C0C0C0' },
  { id: 'badge-cyan',   type: 'badge', name: 'Cyan Badge',   price: 199, color: '#22D3EE' },
  { id: 'crown-gold',   type: 'badge', name: 'Gold Crown (VIP)', price: 0, color: '#FBBF24', vip: true },

  // ---- Hats ----
  { id: 'hat-tophat', type: 'hat', name: 'Top Hat',       price: 299, color: '#111827' },
  { id: 'hat-halo',   type: 'hat', name: 'Glowing Halo',  price: 299, color: '#FDE68A' },
];

const BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

function getItem(id) { return BY_ID[id] || null; }
function purchasable(id) {
  const item = BY_ID[id];
  return item && !item.vip && item.price > 0;
}
function vipOnlyItem(id) {
  const item = BY_ID[id];
  return !!(item && item.vip);
}

module.exports = { CATALOG, getItem, purchasable, vipOnlyItem };
