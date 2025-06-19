# Cicero Flow Metadata
*Last updated: 2026-03-01*

This document outlines the flow of data and the main database tables used by the Cicero_V2 system. It provides an overview from the initial onboarding steps through to reporting and notifications.

## 1. Initial Flow

1. **Client and User Setup**
   - Administrators log in through the dashboard and register new clients using the `/clients` API.
   - Users for each client are created via the `/users` API or imported from Google Sheets.
2. **Authentication**
   - Users authenticate by calling `/api/auth/login` and receive a JWT token.
   - The token is included in subsequent API calls to authorize access.

## 2. Database Overview

Key tables defined in [`sql/schema.sql`](../sql/schema.sql):

| Table              | Purpose                                   |
|--------------------|-------------------------------------------|
| `clients`          | Stores client information and social media identifiers. |
| `user`             | Holds user profiles linked to a client.   |
| `insta_post`                | Instagram posts fetched via RapidAPI.     |
| `insta_like`                | List of likes for each Instagram post.    |
| `insta_profile`             | Basic profile info for Instagram accounts. |
| `instagram_user`            | Detailed Instagram profile data.          |
| `instagram_user_about`      | Additional user metadata.                 |
| `instagram_bio_link`        | Links that appear in the profile bio.     |
| `instagram_profile_pic_version` | History of profile pictures.           |
| `instagram_user_metrics`    | Statistics such as follower counts.       |
| `instagram_user_location`   | Location information for an account.      |
| `tiktok_post`               | TikTok posts associated with a client.    |
| `tiktok_comment`            | Comments for each TikTok post.            |

These tables are updated regularly by scheduled jobs and form the basis for analytics and attendance calculations.

## 3. Process Flow

1. **Data Collection**
   - Cron jobs (`cronInstaService.js`, `cronTiktokService.js`) fetch posts and comments every hour. Results are saved to the database and cached in Redis.
2. **Analytics & Attendance**
   - The backend matches likes or comments with registered users to compute attendance statistics.
   - Summaries can be retrieved via dashboard endpoints under `/dashboard`.
3. **Reporting**
   - Additional cron tasks (`cronInstaLaphar.js`, `cronTiktokLaphar.js`) send daily recap reports to admins through WhatsApp using `waService.js`.
4. **Notification Reminders**
   - `cronNotifikasiLikesDanKomentar.js` reminds users who have not interacted with posts.
5. **Queue Processing (Optional)**
   - Heavy operations can publish tasks to RabbitMQ with `rabbitMQService.js` and are processed asynchronously.

## 4. Final Output

Administrators receive automated WhatsApp reports summarizing daily engagement. The dashboard retrieves analytics via REST endpoints, giving a complete view of social media activity per client.


Petunjuk penamaan kode dapat ditemukan di [docs/naming_conventions.md](naming_conventions.md).
