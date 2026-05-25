'use strict';

const express = require('express');
const Stripe = require('stripe');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { CATALOG, getItem, purchasable } = require('../game/cosmetics');

const router = express.Router();

// Stripe key is loaded from env. NEVER hardcoded. NEVER sent to the client.
// >>> PLUG IN YOUR REAL STRIPE KEY: set STRIPE_SECRET_KEY in .env <<<
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// ---------- Public: catalogue ----------
router.get('/catalog', (req, res) => {
  res.json({ items: CATALOG });
});

// ---------- Cosmetic checkout (one-time) ----------
router.post('/checkout/cosmetic', requireAuth, async (req, res) => {
  const { cosmeticId } = req.body || {};
  if (typeof cosmeticId !== 'string' || !purchasable(cosmeticId)) {
    return res.status(400).json({ error: 'Invalid cosmetic' });
  }

  // Already owned? Don't let them buy twice.
  const already = await db.query(
    'SELECT 1 FROM cosmetics_owned WHERE user_id = $1 AND cosmetic_id = $2',
    [req.user.id, cosmeticId],
  );
  if (already.rows.length) return res.status(409).json({ error: 'Already owned' });

  const item = getItem(cosmeticId);
  const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: item.price,
          product_data: {
            name: `Orbital — ${item.name}`,
            description: `${item.type} cosmetic`,
          },
        },
        quantity: 1,
      }],
      client_reference_id: String(req.user.id),
      metadata: { kind: 'cosmetic', userId: String(req.user.id), cosmeticId },
      success_url: `${baseUrl}/shop.html?purchase=success&item=${encodeURIComponent(cosmeticId)}`,
      cancel_url: `${baseUrl}/shop.html?purchase=cancelled`,
    });
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('cosmetic checkout error', err);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
});

// ---------- VIP subscription checkout ----------
router.post('/checkout/vip', requireAuth, async (req, res) => {
  const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const priceId = process.env.STRIPE_VIP_PRICE_ID;
  if (!priceId) return res.status(500).json({ error: 'VIP price not configured' });

  try {
    // Make sure the user has a Stripe customer
    let customerId = req.user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { userId: String(req.user.id) },
      });
      customerId = customer.id;
      await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.user.id]);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: String(req.user.id),
      metadata: { kind: 'vip', userId: String(req.user.id) },
      success_url: `${baseUrl}/vip.html?vip=success`,
      cancel_url: `${baseUrl}/vip.html?vip=cancelled`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('vip checkout error', err);
    res.status(500).json({ error: 'Could not create subscription session' });
  }
});

// ---------- Customer portal (cancel / update card) ----------
router.post('/portal', requireAuth, async (req, res) => {
  if (!req.user.stripe_customer_id) {
    return res.status(400).json({ error: 'No Stripe customer on file' });
  }
  const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripe_customer_id,
      return_url: `${baseUrl}/profile.html`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('portal error', err);
    res.status(500).json({ error: 'Could not open customer portal' });
  }
});

// ---------- Webhook (mounted with raw body parser in server.js) ----------
// IMPORTANT: This handler expects req.body to be a Buffer (raw). Mount with express.raw().
async function webhookHandler(req, res) {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    // Signature verification prevents fake payment confirmations.
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const kind = session.metadata?.kind;
        const userId = parseInt(session.metadata?.userId, 10);
        if (!userId) break;

        if (kind === 'cosmetic') {
          const cosmeticId = session.metadata?.cosmeticId;
          if (cosmeticId && purchasable(cosmeticId)) {
            await db.query(
              `INSERT INTO cosmetics_owned (user_id, cosmetic_id) VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [userId, cosmeticId],
            );
            await db.query(
              `INSERT INTO purchases (user_id, stripe_session_id, stripe_payment_intent, cosmetic_id, amount_cents, currency, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (stripe_session_id) DO NOTHING`,
              [userId, session.id, session.payment_intent, cosmeticId,
               session.amount_total, session.currency, 'completed'],
            );
          }
        } else if (kind === 'vip') {
          // Subscription created — the subscription.created event will set expiry, but flip the flag now too.
          await db.query('UPDATE users SET is_vip = TRUE WHERE id = $1', [userId]);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const customerId = sub.customer;
        const { rows } = await db.query('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId]);
        if (!rows[0]) break;
        const userId = rows[0].id;
        const active = ['active', 'trialing'].includes(sub.status);
        const expiresAt = new Date(sub.current_period_end * 1000);
        await db.query(
          'UPDATE users SET is_vip = $1, vip_expires_at = $2 WHERE id = $3',
          [active, expiresAt, userId],
        );
        await db.query(
          `INSERT INTO subscriptions (user_id, stripe_subscription_id, status, current_period_end)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end`,
          [userId, sub.id, sub.status, expiresAt],
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const { rows } = await db.query('SELECT id FROM users WHERE stripe_customer_id = $1', [sub.customer]);
        if (!rows[0]) break;
        await db.query('UPDATE users SET is_vip = FALSE WHERE id = $1', [rows[0].id]);
        await db.query(
          'UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2',
          ['canceled', sub.id],
        );
        break;
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object;
        const { rows } = await db.query('SELECT id FROM users WHERE stripe_customer_id = $1', [inv.customer]);
        if (rows[0]) {
          // Soft revoke — VIP flag will also be cleared by subscription.updated -> past_due
          console.log(`Payment failed for user ${rows[0].id}`);
        }
        break;
      }

      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('webhook handler error', err);
    res.status(500).json({ error: 'Webhook handler error' });
  }
}

module.exports = { router, webhookHandler };
