'use strict';

const jwt = require('jsonwebtoken');
const db = require('../db');

/** Extracts JWT from Authorization: Bearer ... and loads the user from DB. */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await db.query(
      'SELECT id, username, email, is_vip, vip_expires_at, stripe_customer_id, selected_skin, selected_trail, selected_badge, high_score FROM users WHERE id = $1',
      [decoded.uid],
    );
    if (!rows[0]) return res.status(401).json({ error: 'User not found' });
    const u = rows[0];
    // Server-side VIP check on every request
    if (u.is_vip && u.vip_expires_at && new Date(u.vip_expires_at) < new Date()) {
      u.is_vip = false;
      await db.query('UPDATE users SET is_vip = FALSE WHERE id = $1', [u.id]);
    }
    req.user = u;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.uid;
  } catch { /* ignore */ }
  next();
}

module.exports = { requireAuth, optionalAuth };
