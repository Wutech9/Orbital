# Orbital — 5-minute daily marketing routine

Open this file every morning. Do the steps. Close it. That's it.

## Step 1 (30 sec) — open today's pack

Path: `marketing/drafts/YYYY-MM-DD/focus.md`

The growth-scribe agent writes this every day at 9:09 AM. It tells you:
- ✅ Which **one** platform to post on today (rotates daily)
- ✅ Which draft file to copy from
- ✅ Which ad image to attach (from `public/ads/`)
- ✅ Best time-of-day to post

## Step 2 (1 min) — pick the variant

Drafts folder has multiple options:
- `tweets.md` → 5 variants
- `reddit.md` → 3 subreddits
- `discord.md` → 1 blurb

Pick the one that reads best to you (you know your voice — the agent is approximating). Edit if needed.

## Step 3 (1 min) — convert + attach the ad

If the post wants an image:
1. Open the SVG at `public/ads/<filename>.svg`
2. Drop it into [cloudconvert.com/svg-to-png](https://cloudconvert.com/svg-to-png) → download
3. Attach to your post

(Once you've converted each ad once, save the PNGs locally and reuse them.)

## Step 4 (2 min) — post + engage

Post. Then **stay in the comments for 10 minutes**. Reply to every reply. This is the highest-leverage moment of the entire day.

## Step 5 (30 sec) — track it

Add one line to `marketing/posted-log.md`:
```
- YYYY-MM-DD · /r/iogames · "Title here" · 4 upvotes / 2 comments · https://reddit.com/r/iogames/...
```

This is what the agents read tomorrow to vary the angle.

---

## Weekly tasks (Monday)

1. Check `marketing/spots-discovered/YYYY-MM-DD.md` (the **spot-scout** agent writes this every Monday). Submit Orbital to one new directory.
2. Look at `marketing/reports/_daily-totals.md` — what was last week's peak? Is the trend up?

## Why this beats "auto-posting"

| Auto-post | This routine |
|----------|-------------|
| Reddit shadowban risk: high | Reddit shadowban risk: zero |
| Looks like a bot | Looks like a human dev |
| Same template every day | Different angle every day |
| Posts when nobody's watching | Posts at optimal hour |
| Can't reply to comments | Replies to comments (where 80% of conversion happens) |
| 5 min / day for you: 0 | 5 min / day for you: 5 |
| Channel lifespan: weeks | Channel lifespan: years |

The 5 minutes you spend are the cheapest insurance you can buy.

## When the agents fail you

If `marketing/drafts/YYYY-MM-DD/` is missing on a given day:

1. The growth-scribe didn't run (Claude Code wasn't open at 9 AM, or hit an error).
2. Look in `marketing/drafts/<latest-existing-date>/` — re-use that day's drafts.
3. Open Claude Code → click "Run now" on `orbital-growth-scribe` in the Scheduled sidebar.

Same for the spot-scout if `marketing/spots-discovered/` is empty.
