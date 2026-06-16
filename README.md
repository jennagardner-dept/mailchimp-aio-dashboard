# Mailchimp AIO Intelligence Dashboard

Tracks how often Mailchimp and its competitors get cited in Google AI Overviews (AIO), plus organic ranking and paid-ad presence on the same SERPs.

Built for Intuit (Mailchimp). Maintained by [DEPT](https://www.deptagency.com/).

## Live dashboard

➡️ **https://jennagardner-dept.github.io/mailchimp-aio-dashboard/**

(Will move to `https://dept.github.io/mailchimp-aio-dashboard/` once the repo is transferred to the `dept` org.)

## How it works

`index.html` is a single self-contained file. It fetches data live from a public Google Sheet via Google's `gviz` JSON endpoint — no backend, no API keys, no build step.

**Data source:** [Google Sheet](https://docs.google.com/spreadsheets/d/1aLqZah8Frx8uVhvu3q55cCFfxUz6ZV7H8jlcKRlDFp0/edit)

- Summary tab (`gid=1479179188`) — one row per scan date with brand-level citation rates
- N-gram / keyword tab (`gid=1189851907`) — per-keyword performance, used by the Keyword Performance tab

The pipeline that populates the sheet has **two stages**:

1. **A SERP API fetcher** (location TBD as of 2026-06-15 — Dirk-Jan Verdoorn set this up; it might be another Apps Script project, a Make/n8n flow, or somewhere else) writes raw scan results into the **`Results`** tab.
2. **`flattenAIOData`** (Apps Script in this same sheet, mirrored in [`apps_script/flattenAIOData.gs`](./apps_script/flattenAIOData.gs)) reads `Results` and writes flattened/aggregated data to `looker_data`, `looker_summary` (the summary GID above), and `looker_ngram` (the ngram GID above) — those last two are what the dashboard reads.

`flattenAIOData` runs on a **Wednesday** time-based trigger, owned by Jenna Gardner (`jennagardner-dept` / `jenna.gardner@deptagency.com`) as of 2026-06-15. The previous trigger (owned by Brooke) is left in the Triggers list in a "disabled" state because it can only be deleted by its original creator — it has no effect.

> 🔎 **Open question (2026-06-15):** the upstream SERP fetcher that populates the `Results` tab lives somewhere outside this Apps Script project — Dirk-Jan Verdoorn set it up. Location and ownership of that piece need to be confirmed.

## Sharing settings

The Google Sheet must be set to **"Anyone with the link can view"** for the dashboard's gviz fetches to work (the dashboard runs in the user's browser as an anonymous request). If the dashboard ever falls back to its hardcoded cached data (orange "Cached data" badge instead of green "Live"), check the sheet's Share dialog → General access → confirm it's not back to "Restricted."

## Owners & backup contacts

| Role | Person |
| --- | --- |
| Primary owner | Jenna Gardner (`jenna.gardner@deptagency.com`) |
| Apps Script author / backup | Dirk-Jan Verdoorn |
| Original author | Brooke Sikora (departed) |

If you're new to maintaining this, the most important thing to verify is that the **Wednesday trigger** in Apps Script is owned by an active account. Triggers run as their creator — if the creator's account is disabled, the script silently stops.

## Updating the dashboard

The dashboard is one file: `index.html`. To change anything (new chart, new competitor, copy tweak), edit it directly and push:

```bash
git add index.html
git commit -m "Describe your change"
git push
```

GitHub Pages redeploys automatically within ~1 minute.

## Updating the data

You don't update the data manually — the Apps Script does. To change what gets tracked:

1. Open the [Google Sheet](https://docs.google.com/spreadsheets/d/1aLqZah8Frx8uVhvu3q55cCFfxUz6ZV7H8jlcKRlDFp0/edit)
2. Edit the keyword list tab
3. Wait for next Wednesday's scheduled run, **or** open Extensions → Apps Script → run the scan function manually

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Dashboard shows "Cached data" (orange badge) instead of "Live" | gviz fetch failed | Confirm the Google Sheet sharing is set to "Anyone with the link can view" |
| Header "Last run" date is stale (more than a week old) | Apps Script trigger didn't fire | Open Apps Script → Triggers → check failures. Likely the trigger creator's account is disabled, or the SERP API quota is exhausted |
| New competitor doesn't appear | Apps Script doesn't track them yet | Add the brand to the script's competitor list, redeploy, run the scan |

## Architecture diagram

```
SERP API ──(Wednesday cron)──► Apps Script ──writes──► Google Sheet
                                                            │
                                                            │ public gviz JSON
                                                            ▼
                                  ┌─────────────────────────┐
   user's browser ◄─── HTTPS ─── │  GitHub Pages (index.html) │
                                  └─────────────────────────┘
```
