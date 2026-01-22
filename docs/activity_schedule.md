# System Activity Schedule
*Last updated: 2026-01-21*

This document summarizes the automated jobs ("activity") that run inside Cicero_V2. All jobs use `node-cron`, are registered from `src/cron/*.js` during `app.js` boot, and execute in the **Asia/Jakarta** timezone unless stated otherwise. Base jobs still come from the manifest in `src/cron/cronManifest.js`, while Ditbinmas (dirRequest) jobs are grouped in `src/cron/dirRequest/index.js` so they can be toggled together while applying per-run WhatsApp readiness checks where needed.【F:src/cron/dirRequest/index.js†L1-L131】

## Runtime safeguards & configuration sync

Every cron file calls `scheduleCronJob`, which delegates to `src/utils/cronScheduler.js`. Before executing a handler, the scheduler fetches the matching record in `cron_job_config`; the job runs only when `is_active=true` so operations can toggle tasks safely without redeploying. The scheduler now retries the lookup once and logs errors before falling back to running the handler if configuration is unavailable, while still honoring `is_active=false` whenever the lookup succeeds. During prolonged database outages, disabled jobs may temporarily run because the safety check cannot be read—monitor `[CRON] Failed to check status...` logs to spot this scenario. The dirRequest group adds a higher-level toggle through `ENABLE_DIRREQUEST_GROUP` to pause all Ditbinmas schedules at once.【F:src/utils/cronScheduler.js†L1-L73】【F:src/cron/dirRequest/index.js†L1-L92】

The configuration data lives in the migration `sql/migrations/20251022_create_cron_job_config.sql` and is surfaced in the cron configuration menu, keeping this schedule synchronized with the controls that ops staff use to enable or pause jobs.【F:sql/migrations/20251022_create_cron_job_config.sql†L1-L34】

dirRequest cron registration happens immediately at boot (subject to `ENABLE_DIRREQUEST_GROUP`), while the custom-sequence handler now waits for the WhatsApp gateway to become ready on each run with a bounded timeout to avoid hanging the schedule when readiness is delayed. Every dirRequest job key is single-flight: if a previous run is still in-flight, the next scheduled run logs a skip message and exits early to prevent overlap.【F:src/cron/dirRequest/index.js†L1-L131】

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
| `cronDirRequestFetchSosmed.js` | `0,30 6-21 * * *<br>0 22 * * *` | Fetch Ditbinmas Instagram/TikTok posts, refresh engagement metrics, and broadcast status deltas; delivery now triggers when the Instagram/TikTok link set changes even if post counts stay flat (pengiriman grup dikunci setelah 17:15 WIB, tetapi fetch post & refresh engagement tetap jalan supaya komentar malam memakai data terbaru). Fetch ini bersifat single-flight: saat job masih berjalan, pemanggilan berikutnya akan mencatat “skip due to in-flight” dan keluar. |
| `cronDashboardSubscriptionExpiry.js` | `*/30 * * * *` | Mark overdue dashboard subscriptions as expired and send WhatsApp reminders when a destination number is available. |
| `cronPremiumExpiry.js` | `0 0 * * *` | Expire mobile premium users when `premium_end_date` is in the past. |
| `cronDashboardPremiumRequestExpiry.js` | `0 * * * *` | Expire pending/confirmed dashboard premium requests after their `expired_at` deadline and send requester/admin WhatsApp notifications. |

### Ditbinmas dirRequest group (registered via `registerDirRequestCrons`)

The schedules below are bundled inside `src/cron/dirRequest/index.js` and register immediately during boot. The dirRequest custom sequence waits for WhatsApp readiness per run with a timeout so the 15:00 and 18:30 slots still fire even if the gateway is slow to become ready. Set `ENABLE_DIRREQUEST_GROUP=false` in the environment to pause all of them together without editing each job record. The table order mirrors the serialized registration chain, and the cron expressions are staggered to avoid overlapping WhatsApp sends in the Asia/Jakarta timezone.【F:src/cron/dirRequest/index.js†L1-L151】

| File | Schedule (Asia/Jakarta) | Description |
|------|-------------------------|-------------|
| `cronWaNotificationReminder.js` | `5 19 * * *<br>45 19 * * *<br>15 20 * * *` | Send WhatsApp task reminders to Ditbinmas and BIDHUMAS users who opted in, spacing each WhatsApp delivery by 3 seconds and persisting each recipient's last stage/completion in `wa_notification_reminder_state` so completed users are skipped on reruns while pending users continue their follow-up stage. |
| `cronDirRequestSatbinmasOfficialMedia.js` | `5 23 * * *` | Share Satbinmas official media updates with Ditbinmas recipients. |
| `cronDirRequestCustomSequence.js` (custom menus) | `0 15 * * *<br>0 18 * * *<br>30 20 * * *` | Chain sosmed fetches, run Ditsamapta menus 6/9/28/29 (plus optional extras) to the Ditsamapta group, super admins, and operators, deliver Ditbinmas menu 21 to the Ditbinmas group, then send BIDHUMAS menus 6, 9, 28, and 29 to the BIDHUMAS group and its super admins. The 20:30 slot now aligns with the Ditbinmas recap and BIDHUMAS 20:30 dispatch without blocking either flow. |
| `cronDirRequestCustomSequence.js` (Ditbinmas recap + custom combined) | `30 20 * * *` | Fetch sosmed content and engagement, execute the Ditbinmas recap (menus 6, 9, 34, 35 for super admins plus 30 for operators), then reuse the same data to run the full custom sequence without re-fetching. |
| `cronDirRequestCustomSequence.js` (Ditbinmas recap) | `33 20 * * *` | Send Ditbinmas menus 6, 9, 34, and 35 to super admins, plus menu 30 to Ditbinmas operators, adding weekly recaps on Sundays and monthly recaps on the last day of the month. |
| `cronDirRequestCustomSequence.js` (BIDHUMAS 20:30) | `30 20 * * *` | Deliver BIDHUMAS menus 6, 9, 28, and 29 at the same time as the Ditbinmas recap without blocking it, targeting the BIDHUMAS group and super admins. |
| `cronDirRequestBidhumasEvening.js` | `0 22 * * *` | Refresh engagement data only (`forceEngagementOnly` skips Instagram/TikTok post fetch) then send dirRequest menus 6, 9, 28, and 29 exclusively to the BIDHUMAS group and its super admin recipients at exactly 22:00 WIB. |

#### Ditbinmas WA reminder persistence

- `cronWaNotificationReminder` writes the per-date, per-`chat_id` + `client_id` reminder state into the `wa_notification_reminder_state` table (primary key: `date_key`, `chat_id`, `client_id`) only after a successful WhatsApp delivery, so the worker can recover after restarts without re-sending completed users while failed deliveries are retried on the next run. Columns include `last_stage` (`initial`, `followup1`, `followup2`, `completed`) and `is_complete` to gate follow-up sends per recipient.
- On each run the job reads the stored state to pick the correct stage, skips rows where `is_complete=true`, and only advances the stage for recipients whose previously stored stage is behind the current run. This keeps once-per-day delivery guarantees for completions while still pushing pending recipients forward to their next follow-up slot.

Each job collects data from the database, interacts with RapidAPI or WhatsApp services, and updates the system accordingly. Refer to [docs/naming_conventions.md](naming_conventions.md) for code style guidelines.
