# System Activity Schedule
*Last updated: 2025-09-14*

This document summarizes the automated jobs ("activity") that run inside Cicero_V2. All jobs use `node-cron` and are started automatically when `app.js` boots. Times are in **Asia/Jakarta** timezone.

## Cron Jobs

| File | Schedule | Description |
|------|----------|-------------|
| `cronInstaService.js` | `32 6-20 * * *` | Every hour at minute 32 between 06:00–20:00. Fetches Instagram posts, updates likes, and sends attendance summaries to admins. |
| `cronInstaLaphar.js` | `00 15,18,21 * * *` | Daily at 15:00, 18:00 and 21:00. Fetches Instagram posts, updates likes and distributes daily reports. |
| `cronRekapLink.js` | `2 15,18,21 * * *` | Daily at 15:02, 18:02 and 21:02. Sends attendance link recaps to operators and admins. |
| `cronAbsensiUserData.js` | `0 13 * * *` | Daily at 13:00. Notifies users and operators about incomplete registration data. |
| `cronAmplifyLinkMonthly.js` | `0 23 28-31 * *` | At 23:00 on the last day of each month. Generates monthly amplification link reports and sends an Excel file to each operator. |
| `cronDirRequestRekapAllSocmed.js` | `0 0 15,18 * * *` & `0 30 20 * * *` | 15:00 & 18:00 send recaps to admins and group; 20:30 also sends to the rekap recipient. |
| `cronDirRequestSosmedRank.js` | `7 15,18 * * *` & `32 20 * * *` | Executes menu 4 & 5 for DITBINMAS; 15:07 & 18:07 send to admins and group; 20:32 also sends to the rank recipient. |
| `cronDirRequestEngageRank.js` | `7 15,18 * * *` & `40 20 * * *` | Runs menu 20 (engagement ranking) and sends the Excel plus narrative to the designated recipient at 15:07, 18:07, and 20:40. |

Each job collects data from the database, interacts with RapidAPI or WhatsApp, and updates the system accordingly. The cron files are imported in `app.js` so no additional setup is required.


Refer to [docs/naming_conventions.md](naming_conventions.md) for code style guidelines.
