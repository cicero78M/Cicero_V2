# System Activity Schedule
*Last updated: 2025-11-08*

This document summarizes the automated jobs ("activity") that run inside Cicero_V2. All jobs use `node-cron`, are registered from `src/cron/*.js` during `app.js` boot, and execute in the **Asia/Jakarta** timezone unless stated otherwise.

## Runtime safeguards & configuration sync

Every cron file calls `scheduleCronJob`, which delegates to `src/utils/cronScheduler.js`. Before executing a handler, the scheduler fetches the matching record in `cron_job_config`; the job runs only when `is_active=true` so operations can toggle tasks safely without redeploying.【F:src/utils/cronScheduler.js†L1-L43】

The configuration data lives in the migration `sql/migrations/20251022_create_cron_job_config.sql` and is surfaced in the cron configuration menu, keeping this schedule synchronized with the controls that ops staff use to enable or pause jobs.【F:sql/migrations/20251022_create_cron_job_config.sql†L1-L34】

## Cron Jobs

| File | Schedule (Asia/Jakarta) | Description |
|------|-------------------------|-------------|
| `cronInstaService.js` | `30 6-21 * * *` | Runs at minute 30 between 06:30–21:30 to fetch Instagram content, refresh like counts, and send "belum" attendance recaps for active clients.【F:src/cron/cronInstaService.js†L15-L105】 |
| `cronInstaLaphar.js` | `00 15,18,21 * * *` | Triggers at 15:00, 18:00, and 21:00 to pull Instagram posts, update likes, and distribute attendance plus amplifikasi updates to operators and admins.【F:src/cron/cronInstaLaphar.js†L39-L128】 |
| `cronRekapLink.js` | `2 15,18,21 * * *` | Sends the link amplification recap at 15:02, 18:02, and 21:02 for every active amplification client.【F:src/cron/cronRekapLink.js†L58-L92】 |
| `cronAmplifyLinkMonthly.js` | `0 23 28-31 * *` | Fires at 23:00 on days 28–31 and proceeds only on the actual last day of the month to generate and deliver monthly amplification spreadsheets.【F:src/cron/cronAmplifyLinkMonthly.js†L29-L78】 |
| `cronDirRequestFetchSosmed.js` | `30 6 * * *`<br>`0,30 7-20 * * *` | Executes once at 06:30 and then every 30 minutes from 07:00–20:30 to fetch new Ditbinmas Instagram/TikTok posts, refresh engagement metrics, and broadcast task status deltas.【F:src/cron/cronDirRequestFetchSosmed.js†L45-L101】 |
| `cronDirRequestRekapAllSocmed.js` | `0 4 15,18 * * *`<br>`0 34 20 * * *` | Sends laphar narratives and recap attachments at 15:04 and 18:04 to admins and the Ditbinmas group, then at 20:34 for the evening recap run.【F:src/cron/cronDirRequestRekapAllSocmed.js†L86-L119】 |
| `cronDirRequestSosmedRank.js` | `7 15 * * *`<br>`40 20 * * *` | Delivers combined Instagram like and TikTok comment rankings at 15:07 and again at 20:40 to admins plus the Ditbinmas group.【F:src/cron/cronDirRequestSosmedRank.js†L34-L46】 |
| `cronDirRequestEngageRank.js` | `7 15 * * *`<br>`40 20 * * *` | Generates and sends the engagement ranking narrative plus Excel at 15:07 and 20:40 to the configured Ditbinmas recipient list.【F:src/cron/cronDirRequestEngageRank.js†L74-L111】 |
| `cronDirRequestLapharKasatker.js` | `42 20 * * *`<br>`47 20 * * 0`<br>`50 20 * * *` | Issues Ditbinmas daily kasatker reports at 20:42, weekly summaries every Sunday at 20:47, and checks for end-of-month conditions at 20:50 before sending the monthly recap.【F:src/cron/cronDirRequestLapharKasatker.js†L63-L106】 |
| `cronDirRequestDirektorat.js` | `32 20 * * *` | Dispatches the Ditbinmas directorate attendance recaps each evening at 20:32 using the `DITBINMAS` client context for all data queries.【F:src/cron/cronDirRequestDirektorat.js†L12-L53】 |
| `cronDirRequestHighLow.js` | `50 20 * * 0` | Sends the weekly Instagram and TikTok high/low performance summaries every Sunday at 20:50.【F:src/cron/cronDirRequestHighLow.js†L31-L56】 |
| `cronAbsensiOprDirektorat.js` | _Not scheduled_ | Helper cron that walks through every active directorate client sequentially and sends the dashboard registration attendance recap to admin WhatsApp targets.【F:src/cron/cronAbsensiOprDirektorat.js†L1-L21】 |

> **Note:** `cronAbsensiUserData.js` currently exposes only a `runCron` helper and is not registered with `scheduleCronJob`, so it remains idle until a schedule is added.【F:src/cron/cronAbsensiUserData.js†L1-L29】

Each job collects data from the database, interacts with RapidAPI or WhatsApp services, and updates the system accordingly. Refer to [docs/naming_conventions.md](naming_conventions.md) for code style guidelines.
