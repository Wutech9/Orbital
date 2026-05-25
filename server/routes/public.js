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

router.get('/health', (req, res) => res.json({ ok: true }));

module.exports = router;
