'use strict';

const express = require('express');
const { CATALOG } = require('../game/cosmetics');
const { getRoomList } = require('../socket/handlers');

const router = express.Router();

// Non-sensitive config the frontend needs (publishable keys / publisher IDs only).
router.get('/config', (req, res) => {
  res.json({
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    adsensePublisherId: process.env.ADSENSE_PUBLISHER_ID || '',
    publicUrl: process.env.PUBLIC_URL || '',
    catalog: CATALOG,
  });
});

router.get('/rooms', (req, res) => {
  res.json({ rooms: getRoomList() });
});

// Public, lightweight stats for the lobby and link-preview crawlers.
router.get('/stats', (req, res) => {
  const rooms = getRoomList();
  const playersOnline = rooms.reduce((sum, r) => sum + r.players, 0);
  res.json({
    playersOnline,
    rooms: rooms.length,
    uptime: Math.floor(process.uptime()),
    version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
  });
});

router.get('/health', (req, res) => res.json({ ok: true }));

module.exports = router;
