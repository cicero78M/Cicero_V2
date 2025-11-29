# System Activity Schedule
*Last updated: 2025-03-11*

This document summarizes the automated jobs ("activity") that run inside Cicero_V2. All jobs use `node-cron`, are registered from `src/cron/*.js` during `app.js` boot, and execute in the **Asia/Jakarta** timezone unless stated otherwise. Base jobs still come from the manifest in `src/cron/cronManifest.js`, while Ditbinmas (dirRequest) jobs are grouped in `src/cron/dirRequest/index.js` so they can share the same WhatsApp gateway readiness checks and be toggled together.

## Runtime safeguards & configuration sync

Every cron file calls `scheduleCronJob`, which delegates to `src/utils/cronScheduler.js`. Before executing a handler, the scheduler fetches the matching record in `cron_job_config`; the job runs only when `is_active=true` so operations can toggle tasks safely without redeploying. The dirRequest group adds a higher-level toggle through `ENABLE_DIRREQUEST_GROUP` to pause all Ditbinmas schedules at once.【F:src/utils/cronScheduler.js†L1-L43】【F:src/cron/dirRequest/index.js†L1-L127】

The configuration data lives in the migration `sql/migrations/20251022_create_cron_job_config.sql` and is surfaced in the cron configuration menu, keeping this schedule synchronized with the controls that ops staff use to enable or pause jobs.【F:sql/migrations/20251022_create_cron_job_config.sql†L1-L34】

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
| `cronInstaService.js` | `30 6-21 * * *` | Fetch Instagram content and likes for active clients while sending attendance recaps. |
| `cronInstaLaphar.js` | `00 15,18,21 * * *` | Send Instagram laphar updates, likes, and amplifikasi summaries to operators and admins. |
| `cronRekapLink.js` | `2 15,18,21 * * *` | Distribute amplification link recaps to all active amplification clients. |
| `cronAmplifyLinkMonthly.js` | `0 23 28-31 * *` | Generate and deliver monthly amplification spreadsheets on the last day of the month. |
| `cronDirRequestRekapUpdate.js` | `0 8-18/4 * * *` | Send Ditbinmas executive summaries and rekap updates to admins and broadcast groups. |

### Ditbinmas dirRequest group (registered via `registerDirRequestCrons`)

The schedules below are bundled inside `src/cron/dirRequest/index.js` and register once the WhatsApp gateway client is ready. Set `ENABLE_DIRREQUEST_GROUP=false` in the environment to pause all of them together without editing each job record.【F:src/cron/dirRequest/index.js†L1-L127】

| File | Schedule (Asia/Jakarta) | Description |
|------|-------------------------|-------------|
| `cronDirRequestFetchSosmed.js` | `30 6 * * *<br>0,30 7-20 * * *` | Fetch Ditbinmas Instagram/TikTok posts, refresh engagement metrics, and broadcast status deltas. |
| `cronDirRequestRekapAllSocmed.js` | `0 4 15,18 * * *<br>0 34 20 * * *` | Send Ditbinmas laphar narratives and recap attachments for daily runs. |
| `cronDirRequestSosmedRank.js` | `7 15 * * *<br>40 20 * * *` | Deliver Instagram like and TikTok comment rankings for Ditbinmas recipients. |
| `cronDirRequestEngageRank.js` | `7 15 * * *<br>40 20 * * *` | Generate engagement ranking narratives and Excel exports for Ditbinmas. |
| `cronDirRequestLapharKasatker.js` | `42 20 * * *<br>47 20 * * 0<br>50 20 * * *` | Send Ditbinmas kasatker daily, weekly, and monthly recaps. |
| `cronDirRequestDirektorat.js` | `32 20 * * *` | Dispatch Ditbinmas directorate attendance recaps. |
| `cronDirRequestHighLow.js` | `50 20 * * 0` | Send weekly Instagram and TikTok high/low performance summaries. |
| `cronDirRequestKasatBinmasRecap.js` | `36 20 * * *<br>42 20 * * 0<br>52 20 * * *` | Provide Ditbinmas Kasat Binmas recap messages. |
| `cronWaNotificationReminder.js` | `5 19 * * *` | Send WhatsApp task reminders to Ditbinmas users who opted in. |
| `cronDirRequestSatbinmasOfficialMedia.js` | `5 13,22 * * *` | Share Satbinmas official media updates with Ditbinmas recipients. |

Each job collects data from the database, interacts with RapidAPI or WhatsApp services, and updates the system accordingly. Refer to [docs/naming_conventions.md](naming_conventions.md) for code style guidelines.
