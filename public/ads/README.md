# Orbital ad creatives

Five aspect ratios, all SVG. Convert to PNG at [cloudconvert.com/svg-to-png](https://cloudconvert.com/svg-to-png) (free, no signup).

| File | Size | Where to use |
|------|------|--------------|
| `ad-1200x630.svg`        | 1200×630   | Open Graph + Twitter Card (already wired in `index.html`) · Reddit link preview · Facebook · Discord · Slack · iMessage |
| `ad-1080x1080.svg`       | 1080×1080  | Instagram post · Reddit text post · subreddit/Discord channel icons · Pinterest pin |
| `ad-1080x1920.svg`       | 1080×1920  | Instagram Story · TikTok cover · YouTube Short cover · Snap |
| `ad-728x90.svg`          | 728×90     | Reddit sidebar banner · forum signature image · email footer |
| `ad-itch-cover-630x500.svg` | 630×500 | itch.io game page cover (exact required size) |

## How to convert SVG → PNG

1. Go to https://cloudconvert.com/svg-to-png
2. Drop the SVG in
3. Click "Convert" → "Download"

Or via command line if you have ImageMagick:
```
magick convert public/ads/ad-1200x630.svg public/ads/ad-1200x630.png
```

## Where to actually use each

### `ad-1200x630.png` (the most important one)
- Replace `public/og-image.svg` reference — already wired to display when someone shares the URL
- Upload to Reddit as the "image" when posting (gets stickied at top)
- Twitter "media" attachment
- Discord embed image when posting `/showcase` channels

### `ad-1080x1080.png`
- The "cover" image when submitting to game directories (iogames.space, kongregate, gamejolt)
- Pinterest pin (search "io games" → high traffic)
- Reddit avatar (your own r/Orbital subreddit if you make one)

### `ad-1080x1920.png`
- Make a 15-second TikTok / Instagram Reel showing gameplay with this as the cover
- TikTok hashtags: #iogame #browsergame #freegame #gaming
- IG Story → "Link" sticker → playorbital.up.railway.app

### `ad-728x90.png`
- If you ever do a *paid* banner buy on a small site, this is the standard size
- Email signature: "Made a multiplayer io game — [image link to play]"
- Discord embed thumbnail for a smaller-format showcase

### `ad-itch-cover-630x500.png`
- itch.io requires exactly 630×500 for the page cover
- Upload during game submission at https://itch.io/game/new
