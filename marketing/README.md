# Orbital — Marketing playbook

Free, organic growth channels only. Nothing here requires payment.

> **Important ethics rule.** Every channel below has community rules. Get banned once and you lose that channel forever. Read each subreddit's rules before posting, post genuinely, and engage with comments. Drive-by self-promo is what kills io games.

## Live URL

```
https://orbital-production-45a9.up.railway.app/
```

## Folders

- [`directories.md`](directories.md) — every free game directory worth submitting to, with notes
- [`reddit-guide.md`](reddit-guide.md) — subreddit posting strategy (per-sub rules respected)
- [`templates/`](templates/) — copy-pasteable post drafts (you review + edit + post yourself)
- [`drafts/`](drafts/) — fresh drafts generated daily by the growth-scribe agent
- [`reports/`](reports/) — daily status reports from monitoring agents

## What's already built into the site

| Lever                     | Where                            |
|---------------------------|----------------------------------|
| Open Graph + Twitter Card | `public/index.html`, `game.html` — beautiful link previews everywhere |
| JSON-LD `VideoGame`       | `public/index.html` — Google Game Knowledge Panel candidacy |
| `sitemap.xml`             | `public/sitemap.xml` — submit to Google Search Console |
| `robots.txt`              | `public/robots.txt` — crawler-friendly |
| Share buttons             | Lobby hero + death overlay — Twitter/Reddit/Facebook/Telegram + copy-link |
| Referral system           | `?ref=USERNAME` → gives credit, builds a viral loop |
| Live player count         | Lobby shows `N playing now` — social proof |
| Death-share with score    | "I reached level 12 with 1,400 points — beat me:" auto-fills |

## The 30-minute "go live" launch checklist

1. **Verify Open Graph renders.** Paste your URL into [opengraph.xyz](https://www.opengraph.xyz/) or Twitter's [Card Validator](https://cards-dev.twitter.com/validator). Should show the og-image + title + description.
2. **Submit sitemap to Google.** [search.google.com/search-console](https://search.google.com/search-console) → Add property → submit `sitemap.xml`.
3. **Submit to game directories.** Walk down [`directories.md`](directories.md) — most take 2–5 min each.
4. **Post on /r/iogames.** Use [`templates/reddit-iogames.md`](templates/reddit-iogames.md). Read sub rules first.
5. **Tweet with #gamedev #iogame.** Use [`templates/twitter-launch.md`](templates/twitter-launch.md).
6. **Join /r/WebGames and /r/incremental_games** — wait a few days, then post.
7. **Post in /r/playmygame** with a GIF/screenshot.
8. **Tell friends.** Word of mouth converts at 30–50% for io games; ads convert at < 1%.

## What the scheduled agents do

(See `OPS.md` in repo root for full details.)

| Agent          | Schedule         | What it does |
|----------------|------------------|--------------|
| sentinel       | every 20 min     | Hits `/api/health` + a guest-play smoke test. Push-notifies on failure. |
| player-pulse   | hourly           | Logs player count, top scorer, room load to `marketing/reports/YYYY-MM-DD.md`. |
| code-watchdog  | daily 6:07 AM    | Runs `npm audit`, checks for failed deploys, files a TODO if anything's flagged. |
| growth-scribe  | daily 9:07 AM    | Writes a fresh tweet draft, Reddit draft, and 1-line LinkedIn / Discord blurb to `marketing/drafts/YYYY-MM-DD/`. You review + post. |

## Why the agents don't post for you

Posting to your accounts requires per-post explicit approval (Anthropic safety policy + the fact that account bans are unrecoverable). The growth-scribe writes drafts that take you 30 seconds to review and post — cheap insurance against a misfire.
