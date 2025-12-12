# System Activity Schedule
*Last updated: 2025-12-12*

This document summarizes the automated jobs ("activity") that run inside Cicero_V2. All jobs use `node-cron`, are registered from `src/cron/*.js` during `app.js` boot, and execute in the **Asia/Jakarta** timezone unless stated otherwise. Base jobs still come from the manifest in `src/cron/cronManifest.js`, while Ditbinmas (dirRequest) jobs are grouped in `src/cron/dirRequest/index.js` so they can share the same WhatsApp gateway readiness checks and be toggled together.

## Runtime safeguards & configuration sync

Every cron file calls `scheduleCronJob`, which delegates to `src/utils/cronScheduler.js`. Before executing a handler, the scheduler fetches the matching record in `cron_job_config`; the job runs only when `is_active=true` so operations can toggle tasks safely without redeploying. The scheduler now retries the lookup once and logs errors before falling back to running the handler if configuration is unavailable, while still honoring `is_active=false` whenever the lookup succeeds. During prolonged database outages, disabled jobs may temporarily run because the safety check cannot be read—monitor `[CRON] Failed to check status...` logs to spot this scenario. The dirRequest group adds a higher-level toggle through `ENABLE_DIRREQUEST_GROUP` to pause all Ditbinmas schedules at once.【F:src/utils/cronScheduler.js†L1-L73】【F:src/cron/dirRequest/index.js†L1-L92】

The configuration data lives in the migration `sql/migrations/20251022_create_cron_job_config.sql` and is surfaced in the cron configuration menu, keeping this schedule synchronized with the controls that ops staff use to enable or pause jobs.【F:sql/migrations/20251022_create_cron_job_config.sql†L1-L34】

dirRequest cron registration now waits for the WhatsApp gateway to emit `ready`, but also installs a 60-second grace-period fallback. If `waGatewayClient.waitForWaReady()` rejects or no ready event ever arrives, the group logs the deferral and auto-activates after the grace window so daily recaps do not get stuck waiting on the gateway.【F:src/cron/dirRequest/index.js†L93-L164】

## Cron Jobs

Use the helper script below to regenerate the manifest-driven table so that schedules stay aligned with the manifest and source files:

```bash
node docs/scripts/renderCronSchedule.js > /tmp/cron-jobs.md
```

Then paste the output into this section. The table is sourced from `src/cron/cronManifest.js` and each module's `scheduleCronJob` call.

### Core cron jobs (manifest-driven)

| File | Schedule (Asia/Jakarta) | Description |
|------|-------------------------|-------------|
| `cronDbBackup.js` | `0 4 * * *` | Backup database dump to Google Drive using service account credentials. |
| `cronRekapLink.js` | `5 15,18,21 * * *` | Distribute amplification link recaps to all active amplification clients. |
| `cronAmplifyLinkMonthly.js` | `0 23 28-31 * *` | Generate and deliver monthly amplification spreadsheets on the last day of the month. |
| `cronDirRequestRekapUpdate.js` | `0 8-18/4 * * *` | Send Ditbinmas executive summaries and rekap updates to admins and broadcast groups. |
| `cronDirRequestRekapBelumLengkapDitsamapta.js` | `15 7-21 * * *` | Send Ditsamapta incomplete Instagram/TikTok data recaps to admin recipients only. |

### Ditbinmas dirRequest group (registered via `registerDirRequestCrons`)

The schedules below are bundled inside `src/cron/dirRequest/index.js` and register once the WhatsApp gateway client is ready. Set `ENABLE_DIRREQUEST_GROUP=false` in the environment to pause all of them together without editing each job record. The table order mirrors the serialized registration chain, and the cron expressions are staggered to avoid overlapping WhatsApp sends in the Asia/Jakarta timezone.【F:src/cron/dirRequest/index.js†L1-L92】

| File | Schedule (Asia/Jakarta) | Description |
|------|-------------------------|-------------|
| `cronDirRequestFetchSosmed.js` | `30 6 * * *<br>0,30 7-21 * * *` | Fetch Ditbinmas Instagram/TikTok posts, refresh engagement metrics, and broadcast status deltas (runs after 17.00 WIB skip new post fetches and only refresh likes/comments). |
| `cronWaNotificationReminder.js` | `5 19 * * *<br>45 19 * * *<br>15 20 * * *` | Send WhatsApp task reminders to Ditbinmas users who opted in, with follow-up pings for users still marked incomplete. |
| `cronDirRequestSatbinmasOfficialMedia.js` | `5 23 * * *` | Share Satbinmas official media updates with Ditbinmas recipients. |
| `cronDirRequestCustomSequence.js` (custom menus) | `0 15 * * *<br>0 18 * * *<br>30 20 * * *<br>0 22 * * *` | Chain sosmed fetches, run Ditsamapta menus 6/9/28/29 (plus optional extras) to the Ditsamapta group, super admins, and operators, deliver Ditbinmas menu 21 to the Ditbinmas group, then send BIDHUMAS menus 6, 9, 28, and 29 to the BIDHUMAS group and its super admins. | 
| `cronDirRequestCustomSequence.js` (Ditbinmas recap) | `30 20 * * *` | Send Ditbinmas menu 21 to the Ditbinmas group, menus 6, 9, 34, and 35 to super admins, plus menu 30 to Ditbinmas operators, adding weekly recaps on Sundays and monthly recaps on the last day of the month. |
| `cronDirRequestCustomSequence.js` (BIDHUMAS 20:30) | `30 20 * * *` | Deliver BIDHUMAS menus 6, 9, 28, and 29 at the same time as the Ditbinmas recap without blocking it, targeting the BIDHUMAS group and super admins. | 
| `cronDirRequestBidhumasEvening.js` | `0 22 * * *` | Chain sosmed fetches then send dirRequest menus 6 and 9 exclusively to the BIDHUMAS group and its super admin recipients at exactly 22:00 WIB. |

Each job collects data from the database, interacts with RapidAPI or WhatsApp services, and updates the system accordingly. Refer to [docs/naming_conventions.md](naming_conventions.md) for code style guidelines.
