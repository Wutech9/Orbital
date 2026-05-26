# Orbital ops — what's running while you're away

There are 4 scheduled Claude agents watching the site. They live in `C:\Users\Alan\.claude\scheduled-tasks\`.

## Important

**The agents only run while Claude Code is open on your machine.** Close the app and they pause. Reopen and they resume — any missed runs that became due get fired on next launch.

## The agents

| Agent              | Cron        | What it does                                                                              |
|--------------------|-------------|-------------------------------------------------------------------------------------------|
| `orbital-sentinel` | hourly      | 4-point health + smoke test of the live site. Push-notifies on failure only.              |
| `orbital-player-pulse` | hourly  | Logs player count / room load / uptime to `marketing/reports/YYYY-MM-DD.md`.              |
| `orbital-code-watchdog` | daily 6am  | `npm audit`, latest commit, summarises last 3 days. Notifies on critical issues only. |
| `orbital-growth-scribe` | daily 9am  | Writes fresh tweet + Reddit + Discord drafts to `marketing/drafts/YYYY-MM-DD/`.        |

## Where their output lands

```
marketing/
├── reports/
│   ├── 2026-05-25.md             # hourly pulse + sentinel lines
│   ├── _daily-totals.md          # rolling per-day peak
│   └── _watchdog-2026-05-25.md   # daily code/security/uptime summary
└── drafts/
    └── 2026-05-25/
        ├── tweet.md              # ready to copy-paste
        ├── reddit-r-iogames.md
        ├── discord.md
        └── note.md               # what angle was used + why
```

## Managing the agents

List / pause / edit them via the **Scheduled** sidebar in Claude Code, or in code via:

- `mcp__scheduled-tasks__list_scheduled_tasks`
- `mcp__scheduled-tasks__update_scheduled_task` — pass `{ enabled: false }` to pause, or edit the prompt
- Delete by removing `C:\Users\Alan\.claude\scheduled-tasks\<task-id>\` (advanced).

## Permission prompts

First run of each agent will pause for permission on Bash/Read/Write/curl etc. **Run each task once manually** ("Run now" in the Scheduled sidebar) and approve "Always allow" for the bash tools they use. Future runs will then proceed silently.

## Why they don't auto-fix

Auto-fixing production code from a cron job is how outages turn into disasters. The agents observe + report + write drafts. **You** review and act. The agents save you 95% of the babysitting time without the blast radius of letting them ship code on their own.

## Disabling everything

If you want them all off while travelling without Claude Code open:

```
mcp__scheduled-tasks__update_scheduled_task with enabled:false for each task ID
```

Or just close Claude Code — they all halt.

## What's NOT covered (be honest)

- The agents can't actually post to your Twitter/Reddit. They draft; you post.
- The agents can't see Railway's internal metrics (memory, request rate). They only know what `/api/*` exposes. If Railway evicts the container, the sentinel will catch it within ~hour.
- The agents can't redeploy. If a deploy is broken, you redeploy.
- No SMS / phone alerts. PushNotification goes to your Claude Code app only.
