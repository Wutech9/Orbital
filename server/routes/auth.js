'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 auth attempts per 15min per IP
  standardHeaders: true,
  legacyHeaders: false,
});

function issueToken(user) {
  return jwt.sign({ uid: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Username must be 3-16 chars, letters/digits/underscore.' });
    if (!EMAIL_RE.test(email))       return res.status(400).json({ error: 'Invalid email.' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be 8-128 chars.' });

    const exists = await db.query('SELECT 1 FROM users WHERE username = $1 OR email = $2', [username, email.toLowerCase()]);
    if (exists.rows.length) return res.status(409).json({ error: 'Username or email already in use.' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { rows } = await db.query(
      `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, username, email, is_vip, selected_skin, selected_trail, selected_badge, high_score`,
      [username, email.toLowerCase(), hash],
    );
    const user = rows[0];
    const token = issueToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const { rows } = await db.query(
      `SELECT id, username, email, password_hash, is_vip, selected_skin, selected_trail, selected_badge, high_score
       FROM users WHERE username = $1 OR email = $1`,
      [username],
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    delete user.password_hash;
    res.json({ token: issueToken(user), user });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  // ownership list for inventory tab
  const { rows: owned } = await db.query(
    'SELECT cosmetic_id FROM cosmetics_owned WHERE user_id = $1',
    [req.user.id],
  );
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      is_vip: req.user.is_vip,
      selected_skin: req.user.selected_skin,
      selected_trail: req.user.selected_trail,
      selected_badge: req.user.selected_badge,
      high_score: req.user.high_score,
    },
    cosmetics: owned.map((r) => r.cosmetic_id),
  });
});

router.post('/equip', requireAuth, async (req, res) => {
  const { skin, trail, badge } = req.body || {};
  const { getItem, vipOnlyItem } = require('../game/cosmetics');

  const updates = [];
  const params = [];
  let i = 1;

  for (const [key, val] of [['selected_skin', skin], ['selected_trail', trail], ['selected_badge', badge]]) {
    if (val == null) continue;
    if (typeof val !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(val)) {
      return res.status(400).json({ error: `Invalid ${key}` });
    }
    if (val !== 'default' && val !== 'none') {
      const item = getItem(val);
      if (!item) return res.status(400).json({ error: `Unknown ${key}` });
      // VIP-only items only equippable by VIPs
      if (vipOnlyItem(val) && !req.user.is_vip) {
        return res.status(403).json({ error: 'VIP only cosmetic' });
      }
      // Must own it (except VIP-only items which are granted by VIP status)
      if (!vipOnlyItem(val)) {
        const { rows } = await db.query(
          'SELECT 1 FROM cosmetics_owned WHERE user_id = $1 AND cosmetic_id = $2',
          [req.user.id, val],
        );
        if (!rows.length) return res.status(403).json({ error: 'You do not own this cosmetic' });
      }
    }
    updates.push(`${key} = $${i++}`);
    params.push(val);
  }

  if (!updates.length) return res.json({ ok: true });
  params.push(req.user.id);
  await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`, params);
  res.json({ ok: true });
});

module.exports = router;
