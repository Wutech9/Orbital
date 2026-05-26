'use strict';

const jwt = require('jsonwebtoken');
const { World, TICK_MS } = require('../game/World');
const { Player, sanitizeName } = require('../game/Player');
const db = require('../db');

// ---------- Room management ----------
const rooms = new Map();
const DEFAULT_ROOMS = [
  { id: 'us-east', name: 'US East' },
  { id: 'eu-west', name: 'EU West' },
  { id: 'asia',    name: 'Asia' },
];
const VIP_ROOMS = [
  { id: 'vip-lounge', name: 'VIP Lounge', vipOnly: true },
];

function ensureDefaultRooms() {
  for (const r of [...DEFAULT_ROOMS, ...VIP_ROOMS]) {
    if (!rooms.has(r.id)) rooms.set(r.id, new World(r));
  }
}
ensureDefaultRooms();

function getRoomList() {
  return [...rooms.values()].map((w) => ({
    id: w.id,
    name: w.name,
    players: w.players.size,
    vipOnly: w.vipOnly,
  }));
}

function getOrCreateCustomRoom(code) {
  if (!/^[A-Z0-9]{4,8}$/.test(code)) return null;
  const id = `code-${code}`;
  if (!rooms.has(id)) rooms.set(id, new World({ id, name: `Room ${code}` }));
  return rooms.get(id);
}

// ---------- Per-IP connection limits ----------
const ipConnections = new Map(); // ip -> count
const MAX_PER_IP = 8;

function getIp(socket) {
  // honour X-Forwarded-For when behind Cloudflare/Railway
  const xff = socket.handshake.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return socket.handshake.address || 'unknown';
}

// ---------- Auth (optional for guests) ----------
async function authenticate(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await db.query(
      'SELECT id, username, is_vip, vip_expires_at, selected_skin, selected_trail, selected_badge FROM users WHERE id = $1',
      [decoded.uid],
    );
    if (!rows[0]) return null;
    const u = rows[0];
    // VIP validity is server-checked here on every join — no client trust
    let isVip = !!u.is_vip;
    if (isVip && u.vip_expires_at && new Date(u.vip_expires_at) < new Date()) {
      isVip = false;
      await db.query('UPDATE users SET is_vip = FALSE WHERE id = $1', [u.id]);
    }
    return {
      userId: u.id,
      username: u.username,
      isVip,
      skin: u.selected_skin,
      trail: u.selected_trail,
      badge: u.selected_badge,
    };
  } catch {
    return null;
  }
}

async function ownsCosmetic(userId, cosmeticId) {
  if (!userId || !cosmeticId || cosmeticId === 'default' || cosmeticId === 'none') return true;
  const { rows } = await db.query(
    'SELECT 1 FROM cosmetics_owned WHERE user_id = $1 AND cosmetic_id = $2 LIMIT 1',
    [userId, cosmeticId],
  );
  return rows.length > 0;
}

// ---------- Wire up ----------
let playerCounter = 1;

function registerSocketHandlers(io) {
  // Broadcast loop per world
  setInterval(() => {
    for (const world of rooms.values()) {
      world.step();
      for (const p of world.players.values()) {
        const sock = io.sockets.sockets.get(p.socketId);
        if (!sock) continue;
        sock.emit('state', world.viewportSnapshot(p));
      }
      world.clearEvents();
    }
  }, TICK_MS);

  io.on('connection', async (socket) => {
    const ip = getIp(socket);
    const count = (ipConnections.get(ip) || 0) + 1;
    if (count > MAX_PER_IP) {
      socket.emit('error_msg', 'Too many connections from your IP.');
      socket.disconnect(true);
      return;
    }
    ipConnections.set(ip, count);

    socket.on('disconnect', () => {
      const c = (ipConnections.get(ip) || 1) - 1;
      if (c <= 0) ipConnections.delete(ip);
      else ipConnections.set(ip, c);

      for (const world of rooms.values()) {
        const p = world.removePlayerBySocket(socket.id);
        if (p) break;
      }
    });

    socket.on('list_rooms', (cb) => {
      if (typeof cb === 'function') cb({ rooms: getRoomList() });
    });

    socket.on('join', async (payload, cb) => {
      try {
        const { name, roomId, customCode, token } = payload || {};
        const acct = await authenticate(token);

        let world;
        if (customCode) {
          world = getOrCreateCustomRoom(String(customCode).toUpperCase().slice(0, 8));
          if (!world) return safeCb(cb, { error: 'Invalid room code' });
        } else if (roomId && rooms.has(roomId)) {
          world = rooms.get(roomId);
        } else {
          world = rooms.get('us-east');
        }

        if (world.vipOnly && !(acct && acct.isVip)) {
          return safeCb(cb, { error: 'VIP only server' });
        }

        // Pick name: account username > submitted name > guest
        const displayName = acct ? acct.username : sanitizeName(name || 'Guest');

        // Verify cosmetic ownership; fall back to defaults if not owned
        let skin = 'default', trail = 'none', badge = 'none';
        if (acct) {
          if (await ownsCosmetic(acct.userId, acct.skin)) skin = acct.skin;
          if (await ownsCosmetic(acct.userId, acct.trail)) trail = acct.trail;
          if (await ownsCosmetic(acct.userId, acct.badge)) badge = acct.badge;
          if (acct.isVip) {
            // gold crown badge takes precedence
            badge = 'crown-gold';
          }
        }

        const player = new Player({
          id: `p${playerCounter++}`,
          name: displayName,
          socketId: socket.id,
          userId: acct ? acct.userId : null,
          isVip: acct ? acct.isVip : false,
          skin, trail, badge,
        });

        world.addPlayer(player);
        safeCb(cb, {
          ok: true,
          playerId: player.id,
          worldSize: world.size,
          roomId: world.id,
          roomName: world.name,
        });
      } catch (err) {
        console.error('join error', err);
        safeCb(cb, { error: 'Internal error' });
      }
    });

    socket.on('input', (input) => {
      const now = Date.now();
      for (const world of rooms.values()) {
        const p = world.getPlayerBySocket(socket.id);
        if (p) { world.applyInput(p, input, now); break; }
      }
    });

    socket.on('upgrade', (stat) => {
      for (const world of rooms.values()) {
        const p = world.getPlayerBySocket(socket.id);
        if (p) { world.upgradeStat(p, stat); break; }
      }
    });

    socket.on('select_class', (classId, cb) => {
      for (const world of rooms.values()) {
        const p = world.getPlayerBySocket(socket.id);
        if (p) {
          const res = world.selectClass(p, classId);
          if (typeof cb === 'function') cb(res);
          return;
        }
      }
      if (typeof cb === 'function') cb({ ok: false, error: 'Not in a game' });
    });

    socket.on('ability', (payload, cb) => {
      const now = Date.now();
      const slot = payload && payload.slot;
      const target = payload && payload.target;
      for (const world of rooms.values()) {
        const p = world.getPlayerBySocket(socket.id);
        if (p) {
          const res = world.castAbility(p, slot, target, now);
          if (typeof cb === 'function') cb(res);
          return;
        }
      }
      if (typeof cb === 'function') cb({ ok: false, error: 'Not in a game' });
    });

    socket.on('respawn', () => {
      const now = Date.now();
      for (const world of rooms.values()) {
        const p = world.getPlayerBySocket(socket.id);
        if (!p) continue;
        if (world.canRespawn(p, now)) {
          // persist high score before reset
          if (p.userId && p.totalScore > 0) {
            db.query(
              'UPDATE users SET high_score = GREATEST(high_score, $1) WHERE id = $2',
              [p.totalScore, p.userId],
            ).catch(() => {});
          }
          world.respawn(p);
        }
        return;
      }
    });
  });
}

function safeCb(cb, val) { if (typeof cb === 'function') cb(val); }

module.exports = { registerSocketHandlers, getRoomList };
