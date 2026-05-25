# Orbital

A multiplayer .io game where you steer a glowing orb through a deep-space arena, absorb stardust to grow, and battle other players for the top of the leaderboard. Built with Node.js + Socket.io + HTML5 Canvas, monetised with Stripe (one-time cosmetics + recurring VIP subscription) and Google AdSense.

> **Live URL:** *not yet — Orbital must be deployed by you (instructions below).* I cannot provision a public URL on your behalf because Railway/Render/Cloudflare all require your accounts. The first time you follow the deploy steps you will get a `https://orbital-production.up.railway.app` (or similar) URL — paste it back in and you're live.

---

## Stack

- **Frontend:** Vanilla HTML5 Canvas + JavaScript (no framework, 60 fps render loop with interpolation)
- **Backend:** Node.js + Express
- **Multiplayer:** Socket.io WebSockets, server-authoritative 30 Hz tick
- **Database:** PostgreSQL (`pg`)
- **Auth:** JWT (`jsonwebtoken`) + bcrypt (12 rounds)
- **Payments:** Stripe Checkout (one-time) + Stripe Billing (subscription) with verified webhooks
- **Ads:** Google AdSense + GDPR consent banner
- **Security:** Helmet (CSP/HSTS), rate limiting, CORS lockdown, anti-cheat
- **Deploy:** Dockerfile + `railway.json` / `render.yaml`; Cloudflare in front for HTTPS + DDoS

## Project layout

```
Orbital/
├── server.js                      # main entry — Express + Socket.io
├── package.json
├── Dockerfile
├── railway.json / render.yaml     # one-click deploy configs
├── .env.example                   # copy to .env and fill in
├── server/
│   ├── db/
│   │   ├── schema.sql             # Postgres schema
│   │   ├── init.js                # creates tables (npm run init-db)
│   │   └── index.js               # pg pool
│   ├── game/
│   │   ├── World.js               # server-authoritative simulation
│   │   ├── Player.js              # player state + input sanitisation
│   │   └── cosmetics.js           # cosmetics catalogue
│   ├── middleware/auth.js         # JWT middleware (requireAuth / optionalAuth)
│   ├── routes/
│   │   ├── auth.js                # register / login / me / equip
│   │   ├── stripe.js              # checkout sessions + webhook handler
│   │   └── public.js              # /api/config, /api/rooms, /api/health
│   └── socket/handlers.js         # join / input / respawn / room mgmt
└── public/                        # client (served statically)
    ├── index.html                 # lobby
    ├── game.html                  # canvas + HUD + death overlay
    ├── shop.html / vip.html
    ├── login.html / register.html / profile.html / privacy.html
    ├── css/style.css
    └── js/
        ├── auth.js                # token storage, /me, nav rendering
        ├── ads.js                 # GDPR banner + lazy AdSense loader
        ├── lobby.js               # rooms list + play button
        ├── game.js                # canvas renderer + socket client
        ├── shop.js / vip.js / profile.js
        └── preview.js             # cosmetic preview renderer
```

## Local setup (developer machine)

Requires **Node 18+** and **PostgreSQL 14+** (or Docker).

```bash
# 1. Install deps
npm install

# 2. Create .env from the template
cp .env.example .env
# then open .env and fill in DATABASE_URL, JWT_SECRET, Stripe test keys

# 3. Create database tables
npm run init-db

# 4. Start the server
npm start
# -> http://localhost:3000
```

Open two browser tabs at `http://localhost:3000` — both can join the same server and you'll see each other live.

## Deployment

### Option A — Railway (easiest)

1. Push this repo to GitHub.
2. Sign in to [railway.app](https://railway.app), click **New Project → Deploy from GitHub** and pick the repo.
3. Railway will read `railway.json` and `Dockerfile`. In the Variables tab add:
   - `JWT_SECRET` — generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
   - `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_VIP_PRICE_ID`
   - `ADSENSE_PUBLISHER_ID` (`ca-pub-XXXXXXXXXXXXXXXX`)
   - `NODE_ENV=production`
   - `PUBLIC_URL=https://<your-app>.up.railway.app`
   - `CORS_ORIGIN=https://<your-app>.up.railway.app` (and your custom domain once added)
4. Add a Postgres service to the project → Railway auto-injects `DATABASE_URL`.
5. After first deploy, run **`npm run init-db`** from the Railway shell to create tables.
6. Visit the generated `*.up.railway.app` URL — that's your live link.

### Option B — Render

1. Push to GitHub.
2. In [render.com](https://render.com) click **New → Blueprint** and select the repo. It will read `render.yaml`.
3. Fill in the Stripe + AdSense env vars when prompted (they are `sync: false` so Render won't commit them).
4. Render provisions the Postgres database and wires `DATABASE_URL` automatically.
5. After deploy, open the service shell and run `npm run init-db`.

### Cloudflare (HTTPS + DDoS protection + CDN)

1. Buy a domain and add it to Cloudflare (free tier is fine).
2. In Cloudflare DNS, add a `CNAME` for `www` (or `@`) pointing to your Railway/Render URL. Set proxy status to **Proxied** (orange cloud).
3. SSL/TLS mode → **Full (strict)**.
4. Rules → **Always Use HTTPS** = on; **HSTS** = on (after you've verified the site).
5. Set `CORS_ORIGIN` and `PUBLIC_URL` env vars to `https://yourgame.com`.

## Connecting Stripe (real payments)

You can build and test entirely in Stripe test mode — that's how `.env` ships by default. To go live:

1. **Create products** in the Stripe Dashboard:
   - One **subscription** product priced at $4.99/mo recurring → copy its **Price ID** into `STRIPE_VIP_PRICE_ID`.
   - The cosmetics catalogue is generated dynamically (`price_data` on the fly), so you do *not* need to create products for each skin.
2. **Webhook endpoint:** Dashboard → Developers → Webhooks → **Add endpoint**:
   - URL: `https://<your-live-url>/api/stripe/webhook`
   - Events to send: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
3. **Going live:** Replace `sk_test_...` / `pk_test_...` with `sk_live_...` / `pk_live_...` and add a new live webhook endpoint.
4. **Test cards:** `4242 4242 4242 4242`, any future expiry, any CVC.

## Connecting Google AdSense

1. Apply at [adsense.google.com](https://adsense.google.com) — approval needs a live domain with real content. Get the game deployed first.
2. Once approved, copy your **publisher ID** (`ca-pub-XXXXXXXXXXXXXXXX`) into the `ADSENSE_PUBLISHER_ID` env var.
3. In AdSense → Ads → By ad unit, create three units:
   - **Death screen** (Display, 336×280 or responsive)
   - **Sidebar** (Display, 160×600)
   - **Lobby banner** (Display, 728×90 or responsive)
4. Copy each `data-ad-slot` ID into the matching `<ins class="adsbygoogle">` block in `public/game.html` and `public/index.html`. Each block is currently commented and labelled with the slot name.

VIP users get `is-vip` on `<body>` and CSS hides every ad slot for them.

## Security checklist (verified)

| Requirement                              | Where                                               |
|------------------------------------------|-----------------------------------------------------|
| Server-authoritative game logic          | `server/game/World.js`                              |
| Input validation & sanitization          | `Player.sanitizeName`, regex on cosmetic IDs        |
| Rate limiting (REST)                     | `express-rate-limit` on `/api/*` + `/auth/*`        |
| Rate limiting (Socket.io)                | per-socket input cap, 60/sec, in `World.applyInput` |
| Helmet (CSP / HSTS / X-Frame / XSS)      | `server.js`                                         |
| HTTPS only                               | x-forwarded-proto redirect in production            |
| CORS lockdown                            | `cors({ origin: CORS_ORIGIN })` in prod             |
| Stripe webhook signature verification    | `stripe.webhooks.constructEvent` in stripe.js       |
| JWT on all account-gated routes          | `requireAuth` middleware                            |
| Bcrypt password hashing (12 rounds)      | `routes/auth.js` `BCRYPT_ROUNDS = 12`               |
| Anti-cheat (impossible speed / bounds)   | `World.step` clamps + input normalisation           |
| No sensitive data sent to client         | snapshot only includes id/name/pos/score            |
| Stripe secret in env only                | `process.env.STRIPE_SECRET_KEY`, never in client    |
| `npm audit` before deploy                | `npm audit --omit=dev` before going live            |
| Per-IP socket connection cap             | `MAX_PER_IP = 8` in `socket/handlers.js`            |

After deploying, verify headers with [securityheaders.com](https://securityheaders.com/) → should score A.

## Verification checklist (post-deploy)

- [ ] Two browser tabs at the live URL can connect and see each other.
- [ ] Death screen renders the AdSense placeholder; the 5s countdown enables the Respawn button afterwards.
- [ ] Test skin purchase using `4242 4242 4242 4242` → returns to `/shop.html?purchase=success` → the cosmetic appears in the inventory tab within ~5 seconds (after webhook completes).
- [ ] Test VIP subscription with the same card → returns to `/vip.html?vip=success` → reload shows `★ VIP active`, the Gold Crown is rendered on your orb in-game, sidebar/death/lobby ads are hidden, and the VIP Lounge appears in the room list.
- [ ] Stripe Dashboard → Developers → Webhooks shows successful 200 responses to events.
- [ ] [securityheaders.com](https://securityheaders.com/) on your live URL returns at least an A.

## Where to plug in your real keys

| Key                          | Where to set                              | Notes                                            |
|------------------------------|-------------------------------------------|--------------------------------------------------|
| `STRIPE_SECRET_KEY`          | `.env` / Railway/Render env               | Server-only. **Never commit.**                   |
| `STRIPE_PUBLISHABLE_KEY`     | `.env`                                    | Sent to client via `/api/config`.                |
| `STRIPE_WEBHOOK_SECRET`      | `.env`                                    | From Stripe Dashboard webhook page.              |
| `STRIPE_VIP_PRICE_ID`        | `.env`                                    | Stripe product Price ID for $4.99/mo.            |
| `ADSENSE_PUBLISHER_ID`       | `.env`                                    | `ca-pub-XXXX...` format. Also paste into the `<ins>` tags in `index.html` and `game.html` (search for `ca-pub-XXXXXXXXXXXXXXXX`). |
| `JWT_SECRET`                 | `.env`                                    | 64+ random bytes; rotate periodically.           |
| `DATABASE_URL`               | injected by Railway/Render                | Set manually only if self-hosting Postgres.      |

## Known limitations

- This build is a single-process server. To scale past ~500 concurrent players you'd want Redis pub/sub between socket.io instances and a sticky-session load balancer.
- AdSense approval requires a real domain with policy-compliant content. Plan a few days for approval after launch.
- VIP-only servers are currently a single instance ("VIP Lounge"). Add more in `socket/handlers.js → VIP_ROOMS`.

## License

MIT — yours to ship.
