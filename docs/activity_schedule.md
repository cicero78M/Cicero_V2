# System Activity Schedule
*Last updated: 2025-12-06*

This document summarizes the automated jobs ("activity") that run inside Cicero_V2. All jobs use `node-cron`, are registered from `src/cron/*.js` during `app.js` boot, and execute in the **Asia/Jakarta** timezone unless stated otherwise. Base jobs still come from the manifest in `src/cron/cronManifest.js`, while Ditbinmas (dirRequest) jobs are grouped in `src/cron/dirRequest/index.js` so they can share the same WhatsApp gateway readiness checks and be toggled together.

## Runtime safeguards & configuration sync

Every cron file calls `scheduleCronJob`, which delegates to `src/utils/cronScheduler.js`. Before executing a handler, the scheduler fetches the matching record in `cron_job_config`; the job runs only when `is_active=true` so operations can toggle tasks safely without redeploying. The scheduler now retries the lookup once and logs errors before falling back to running the handler if configuration is unavailable, while still honoring `is_active=false` whenever the lookup succeeds. During prolonged database outages, disabled jobs may temporarily run because the safety check cannot be read—monitor `[CRON] Failed to check status...` logs to spot this scenario. The dirRequest group adds a higher-level toggle through `ENABLE_DIRREQUEST_GROUP` to pause all Ditbinmas schedules at once.【F:src/utils/cronScheduler.js†L1-L73】【F:src/cron/dirRequest/index.js†L1-L127】

The configuration data lives in the migration `sql/migrations/20251022_create_cron_job_config.sql` and is surfaced in the cron configuration menu, keeping this schedule synchronized with the controls that ops staff use to enable or pause jobs.【F:sql/migrations/20251022_create_cron_job_config.sql†L1-L34】

dirRequest cron registration now waits for the WhatsApp gateway to emit `ready`, but also installs a 60-second grace-period fallback. If `waGatewayClient.waitForWaReady()` rejects or no ready event ever arrives, the group logs the deferral and auto-activates after the grace window so daily recaps do not get stuck waiting on the gateway.【F:src/cron/dirRequest/index.js†L129-L179】

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
| `cronInstaService.js` | `35 6-21 * * *` | Fetch Instagram content and likes for active clients while sending attendance recaps. |
| `cronInstaLaphar.js` | `00 15,18,21 * * *` | Send Instagram laphar updates, likes, and amplifikasi summaries to operators and admins. |
| `cronRekapLink.js` | `5 15,18,21 * * *` | Distribute amplification link recaps to all active amplification clients. |
| `cronAmplifyLinkMonthly.js` | `0 23 28-31 * *` | Generate and deliver monthly amplification spreadsheets on the last day of the month. |
| `cronDirRequestRekapUpdate.js` | `0 8-18/4 * * *` | Send Ditbinmas executive summaries and rekap updates to admins and broadcast groups. |

### Ditbinmas dirRequest group (registered via `registerDirRequestCrons`)

The schedules below are bundled inside `src/cron/dirRequest/index.js` and register once the WhatsApp gateway client is ready. Set `ENABLE_DIRREQUEST_GROUP=false` in the environment to pause all of them together without editing each job record. The table order mirrors the serialized registration chain, and the cron expressions are staggered to avoid overlapping WhatsApp sends in the Asia/Jakarta timezone.【F:src/cron/dirRequest/index.js†L1-L127】

| File | Schedule (Asia/Jakarta) | Description |
|------|-------------------------|-------------|
| `cronDirRequestFetchSosmed.js` | `30 6 * * *<br>0,30 7-21 * * *<br>0 22 * * *` | Fetch Ditbinmas Instagram/TikTok posts, refresh engagement metrics, and broadcast status deltas (runs after 17.00 WIB skip new post fetches and only refresh likes/comments). |
| `cronDirRequestDirektorat.js` | `0 0 15 * * *<br>0 0 18 * * *<br>0 0 22 * * *<br>0 0 20 * * *` | Dispatch Ditbinmas directorate attendance recaps for every active directorate client with Instagram and TikTok enabled. BIDHUMAS receives group-only blasts at 15:00 and 18:00 WIB, a group-and-super-admin drop at 22:00 WIB, and the nightly run sends DITBINMAS to super admins, BIDHUMAS to its group and super admins, and other directorates to their super admins. |
| `cronDirRequestRekapAllSocmed.js` | `0 0 15,18 * * *<br>0 0 20 * * *` | Send Ditbinmas laphar narratives with Instagram like and TikTok comment recap attachments (no new post fetch). |
| `cronDirRequestSosmedRank.js` | `7 15 * * *<br>37 20 * * *` | Deliver Instagram like and TikTok comment rankings for Ditbinmas recipients, staggered ahead of other 20:00 block jobs. |
| `cronDirRequestEngageRank.js` | `10 15 * * *<br>40 20 * * *` | Generate engagement ranking narratives and Excel exports for Ditbinmas, following the ranking drop spacing. |
| `cronDirRequestKasatBinmasRecap.js` | `38 20 * * *<br>39 20 * * 0<br>41 20 * * *` | Provide Ditbinmas Kasat Binmas daily, weekly, and month-end recaps to super admin contacts (no operator or group delivery). |
| `cronDirRequestHighLow.js` | `42 20 * * 0` | Send weekly Instagram and TikTok high/low performance summaries after Kasat Binmas recaps. |
| `cronDirRequestLapharKasatker.js` | `43 20 * * *<br>44 20 * * 0<br>45 20 * * *` | Send Ditbinmas kasatker daily, weekly, and month-end recaps **only to operator contacts**, spaced after weekly high/low. |
| `cronWaNotificationReminder.js` | `5 19 * * *<br>45 19 * * *<br>15 20 * * *` | Send WhatsApp task reminders to Ditbinmas users who opted in, with follow-up pings for users still marked incomplete. |
| `cronDirRequestSatbinmasOfficialMedia.js` | `5 23 * * *` | Share Satbinmas official media updates with Ditbinmas recipients. |

Each job collects data from the database, interacts with RapidAPI or WhatsApp services, and updates the system accordingly. Refer to [docs/naming_conventions.md](naming_conventions.md) for code style guidelines.
