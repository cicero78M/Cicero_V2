# System Activity Schedule
*Last updated: 2025-07-25*

This document summarizes the automated jobs ("activity") that run inside Cicero_V2. All jobs use `node-cron` and are started automatically when `app.js` boots. Times are in **Asia/Jakarta** timezone.

## Cron Jobs

| File | Schedule | Description |
|------|----------|-------------|
| `cronInstaService.js` | `32 6-20 * * *` | Every hour at minute 32 between 06:00–20:00. Fetches Instagram posts, updates likes, and sends attendance summaries to admins. |
| `cronTiktokService.js` | `30 6-20 * * *` | Every hour at minute 30 between 06:00–20:00. Fetches TikTok posts and comments then performs comment attendance. |
| `cronInstaLaphar.js` | `00 15,18,21 * * *` | Daily at 15:00, 18:00 and 21:00. Fetches Instagram posts, updates likes and distributes daily reports. |
| `cronTiktokLaphar.js` | `03 15,18,21 * * *` | Daily at 15:03, 18:03 and 21:03. Fetches TikTok posts and comments then sends attendance reports to recipients. |
| `cronInstaDataMining.js` | `40 23 * * *` | Daily at 23:40. Crawls Instagram accounts for new posts and stores extended metadata. |
| `cronNotifikasiLikesDanKomentar.js` | `10 12,16,19 * * *` | Daily at 12:10, 16:10 and 19:10. Sends WhatsApp reminders to users who have not liked/commented on today's posts. |
| `cronAmplifyLinkMonthly.js` | `0 23 28-31 * *` | At 23:00 on the last day of each month. Generates monthly amplification link reports and sends an Excel file to each operator. |

Each job collects data from the database, interacts with RapidAPI or WhatsApp, and updates the system accordingly. The cron files are imported in `app.js` so no additional setup is required.


Refer to [docs/naming_conventions.md](naming_conventions.md) for code style guidelines.
