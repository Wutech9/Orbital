'use strict';

require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Server: SocketServer } = require('socket.io');

const authRoutes = require('./server/routes/auth');
const publicRoutes = require('./server/routes/public');
const { router: stripeRoutes, webhookHandler } = require('./server/routes/stripe');
const { registerSocketHandlers } = require('./server/socket/handlers');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

if (!process.env.JWT_SECRET) {
  console.warn('[warn] JWT_SECRET is not set. Set one in .env before deploying.');
}

const app = express();
app.set('trust proxy', 1); // we're behind Cloudflare/Railway/Render

// Security headers (CSP, HSTS, X-Frame-Options, XSS protection, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": [
        "'self'",
        "'unsafe-inline'",
        'https://js.stripe.com',
        'https://pagead2.googlesyndication.com',
        'https://www.googletagservices.com',
        'https://googleads.g.doubleclick.net',
        'https://cdn.socket.io',
      ],
      "frame-src": [
        "'self'",
        'https://js.stripe.com',
        'https://hooks.stripe.com',
        'https://googleads.g.doubleclick.net',
        'https://www.google.com',
      ],
      "img-src": ["'self'", 'data:', 'https:'],
      "style-src": ["'self'", "'unsafe-inline'"],
      "connect-src": [
        "'self'",
        'wss:',
        'https://api.stripe.com',
        'https://pagead2.googlesyndication.com',
      ],
      "font-src": ["'self'", 'data:'],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
    },
  },
  hsts: IS_PROD ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
  crossOriginEmbedderPolicy: false,
}));

// HTTP -> HTTPS redirect when behind Cloudflare/Railway (uses x-forwarded-proto).
if (IS_PROD) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// CORS — only allow the configured origin in production.
app.use(cors({
  origin: IS_PROD ? (process.env.CORS_ORIGIN || false) : true,
  credentials: false,
}));

app.use(compression());

// --- Stripe webhook MUST receive raw body for signature verification. ---
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), webhookHandler);

// Global JSON parser for everything else.
app.use(express.json({ limit: '64kb' }));

// Global REST rate limit (Socket.io has its own per-event limiter).
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 240, // 4 req/sec average
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

app.use('/api', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/stripe', stripeRoutes);

// Static client
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: IS_PROD ? '1h' : 0,
}));

// SPA-style fallback for root: send index.html
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: IS_PROD ? (process.env.CORS_ORIGIN || false) : true,
    credentials: false,
  },
  pingInterval: 20000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e5, // 100kb cap on socket messages
});

registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`Orbital running on http://localhost:${PORT} (${IS_PROD ? 'prod' : 'dev'})`);
});

// Hardening: don't crash on unhandled promise rejections in prod
process.on('unhandledRejection', (err) => console.error('unhandledRejection', err));
process.on('uncaughtException', (err) => console.error('uncaughtException', err));
