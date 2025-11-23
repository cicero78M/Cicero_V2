# Database Structure

*Last updated: 2025-11-06*

This document describes the main tables inside Cicero_V2 and their relationships.
The SQL schema is located at [sql/schema.sql](../sql/schema.sql) and is designed
for PostgreSQL but can work with MySQL or SQLite via the DB adapter.

## Table Overview

| Table Name | Purpose |
|------------|---------|
| clients | master table for registered organisations |
| satbinmas_official_accounts | Satbinmas official handles linked to a client |
| user | members belonging to a client |
| roles / user_roles | role catalogue and pivot for users |
| dashboard_user | login credentials for dashboard access |
| dashboard_user_clients | mapping between dashboard users and permitted clients |
| penmas_user | credentials for Penmas editorial operators |
| insta_post / insta_post_khusus | Instagram posts fetched for each client (regular & khusus feeds) |
| insta_like / insta_comment | cached likes and comments for Instagram posts |
| insta_profile | basic Instagram profile information |
| insta_post_roles | restricts Instagram post visibility per role |
| tiktok_post / tiktok_post_roles | TikTok videos and their role restrictions |
| tiktok_comment | cached TikTok comments |
| instagram_user / instagram_user_metrics | extended Instagram account data |
| ig_ext_* tables | RapidAPI references for detailed Instagram metadata |
| visitor_logs | record of API access |
| tasks | outstanding assignments for users versus posts |
| link_report / link_report_khusus | links submitted from the mobile app (regular & khusus) |
| editorial_event | Penmas editorial events |
| press_release_detail | extended press-release information for an editorial event |
| approval_request | approval workflow for editorial events |
| change_log | mutation history for editorial events |
| premium_request | premium subscription requests |
| login_log | history of login events |
| saved_contact | Google People API cache used for WhatsApp messaging |

## Tables

### `clients`
Represents each organisation using the system.
- `client_id` – primary key
- `nama` – organisation name
- `client_type` – text description of the type
- `client_status` – boolean, active or not
- `client_insta` / `client_tiktok` – usernames of the client accounts
- `client_operator`, `client_group`, `tiktok_secuid`, `client_super` – optional metadata

Official Satbinmas accounts for each client are stored in the dedicated
`satbinmas_official_accounts` table described below so that operators can manage
per-platform handles without mutating legacy `client_*` columns.

### `user`
Holds users belonging to a client.
- `user_id` – primary key (NRP/NIP string)
- `nama`, `title`, `divisi` – user info fields
- `insta`, `tiktok` – social media handles
- `desa` – desa binaan for Ditbinmas users
- `email` – optional, validated during OTP flows
- `client_id` – foreign key referencing `clients(client_id)`
- `status` – boolean flag
- `premium_status` – boolean flag indicating active subscription
- `premium_end_date` – date the premium access expires
- roles are assigned through the `user_roles` pivot table

### `roles`
Stores available role names.
- `role_id` – serial primary key
- `role_name` – unique role identifier

### `user_roles`
Pivot table linking users to roles.
- `user_id` – references `user(user_id)`
- `role_id` – references `roles(role_id)`
- composite primary key `(user_id, role_id)`

### `penmas_user`
Dedicated credential store for Penmas editorial accounts.
- `user_id` – primary key
- `username` – unique login identifier
- `password_hash` – bcrypt hash
- `role` – textual role label (e.g. `editor`, `validator`)
- `created_at`, `updated_at`

### `dashboard_user`
Credentials for the web dashboard login.
- `dashboard_user_id` – primary key generated with `gen_random_uuid()`
- `username` – unique login name
- `password_hash` – bcrypt hashed password
- `role_id` – foreign key referencing `roles(role_id)`
- `status` – boolean indicating whether the account is active
- `user_id` – optional link to `user(user_id)`
- `whatsapp` – contact number used for notifications
- `created_at`, `updated_at` – timestamps

### `dashboard_user_clients`
Link table assigning dashboard accounts to the clients they can view.
- `dashboard_user_id` – references `dashboard_user(dashboard_user_id)`
- `client_id` – references `clients(client_id)`
- composite primary key `(dashboard_user_id, client_id)`

### `insta_post`
Stores Instagram posts fetched for a client.
- `shortcode` – primary key of the post
- `client_id` – foreign key to `clients`
- `caption` – post text
- `comment_count` – number of comments
- `thumbnail_url` – image preview
- `is_video` – boolean whether post is a video
- `video_url` – link to video file if any
- `image_url` – link to image file
- `images_url` – JSON array of all image URLs when the post is a carousel
- `is_carousel` – boolean indicating whether the post contains multiple images
- `created_at` – timestamp of the post

### `insta_post_khusus`
Stores curated Instagram posts for khusus audiences.
- Same columns as `insta_post`
- Independent primary key (`shortcode`) to allow separate scheduling

### `insta_like`
List of users who liked an Instagram post.
- `shortcode` – primary key and foreign key to `insta_post(shortcode)`
- `likes` – JSON array of usernames
- `updated_at` – when the like data was fetched

### `insta_comment`
Cached comments for an Instagram post.
- `shortcode` – primary key and foreign key to `insta_post(shortcode)`
- `comments` – JSON array of comment payloads
- `updated_at`

### `insta_post_roles`
Restricts `insta_post` visibility by role.
- `shortcode` – references `insta_post(shortcode)` with cascade delete
- `role_name` – role allowed to view the post
- composite primary key `(shortcode, role_name)`

### `insta_profile`
Profile information for arbitrary Instagram accounts.
- `username` – primary key
- `full_name`, `biography`, `follower_count`, `following_count`,
  `post_count`, `profile_pic_url`, `updated_at`

### `tiktok_post`
Data for TikTok videos associated with a client.
- `video_id` – primary key
- `client_id` – foreign key to `clients`
- `caption`, `like_count`, `comment_count`, `created_at`

### `tiktok_post_roles`
Restricts TikTok post visibility by role.
- `video_id` – references `tiktok_post(video_id)` with cascade delete
- `role_name` – permitted role name
- composite primary key `(video_id, role_name)`

### `tiktok_comment`
Comments for a TikTok video.
- `video_id` – primary key and foreign key to `tiktok_post(video_id)`
- `comments` – JSON array of comments
- `updated_at`

### `tasks`
Stores assignments of users to Instagram posts for follow-up.
- `shortcode` – references `insta_post(shortcode)`
- `user_id` – references `user(user_id)`
- `created_at` – timestamp of assignment creation
- Indexed composite `(shortcode, user_id, created_at)` accelerates lookups

### `instagram_user`
Core profile details returned from Instagram scraping.
- `user_id` – primary key
- `username`, `full_name`, `biography`
- `business_contact_method`, `category`, `category_id`, `account_type`
- `contact_phone_number`, `external_url`, `fbid_v2`
- `is_business`, `is_private`, `is_verified`
- `public_email`, `public_phone_country_code`, `public_phone_number`
- `profile_pic_url`, `profile_pic_url_hd`

### `instagram_user_metrics`
Follower and media statistics.
- `user_id` – primary key referencing `instagram_user`
- `follower_count`, `following_count`, `media_count`
- `total_igtv_videos`, `latest_reel_media`

### `ig_ext_users`, `ig_ext_posts`, `ig_ext_media_items`, `ig_ext_tagged_users`, `ig_ext_hashtags`, `ig_hashtag_info`, `ig_post_metrics`, `ig_post_like_users`, `ig_post_comments`
Extended Instagram metadata persisted from RapidAPI responses. These tables maintain normalised references between posts, media items, tagged users, hashtags, metrics, likes, and comments for deeper analytics.

### `link_report`
Stores social media links submitted from the mobile app.
- `shortcode` – foreign key to `insta_post`
- `user_id` – foreign key to `user`
- `shortcode` and `user_id` form the primary key
- `instagram_link`, `facebook_link`, `twitter_link`, `tiktok_link`, `youtube_link`
- `created_at` – timestamp when the report was submitted
- Rows cascade when the related `insta_post` is removed

### `link_report_khusus`
Khusus equivalent of `link_report`, referencing `insta_post_khusus`.
- `shortcode` – foreign key to `insta_post_khusus`
- `user_id` – foreign key to `user`
- Social link columns and `created_at` mirror the regular table

### `premium_request`
Records premium subscription requests sent from the mobile app.
- `request_id` – primary key
- `user_id` – foreign key to `user`
- `sender_name` – name of the account owner used for payment
- `account_number` – bank account number used to transfer
- `bank_name` – originating bank for the transfer
- `screenshot_url` – optional path to proof of payment
- `status` – `pending`, `approved`, `rejected` or `expired`
- `created_at`, `updated_at` – timestamps

### `visitor_logs`
Stores anonymised request metadata for auditing.
- `id` – primary key
- `ip`, `user_agent`
- `visited_at` – timestamp (defaults to `NOW()`)

### `login_log`
Stores login events for auditing.
- `log_id` – primary key
- `actor_id` – identifier of the user or client
- `login_type` – `operator` or `user`
- `login_source` – `web` or `mobile`
- `logged_at` – timestamp when the login occurred

### `editorial_event`
Represents Penmas editorial planning entries.
- `event_id` – serial primary key
- `event_date`, `topic`, `judul_berita` – scheduling metadata
- `assignee`, `status`, `content`, `summary`, `image_path`, `tag`, `kategori`
- `created_by`, `updated_by` – references to `penmas_user`
- `created_at`, `last_update`

### `press_release_detail`
Extended press release attributes tied to an `editorial_event`.
- `event_id` – primary key referencing `editorial_event`
- `judul`, `dasar`, `tersangka`, `tkp`, `kronologi`, `modus`, `barang_bukti`, `pasal`, `ancaman`, `catatan`

### `approval_request`
Approval lifecycle for editorial events.
- `request_id` – serial primary key
- `event_id` – references `editorial_event`
- `requested_by` – references `penmas_user`
- `status` – `pending`, `approved`, `rejected`
- `created_at`, `updated_at`

### `change_log`
Tracks changes applied to an editorial event.
- `log_id` – serial primary key
- `event_id` – references `editorial_event`
- `user_id` – references `penmas_user`
- `status` – textual status after the change
- `changes` – textual diff summary
- `logged_at`

### `saved_contact`
Google People API cache for WhatsApp integrations.
- `phone_number` – primary key
- `resource_name` – People API resource identifier
- `created_at`

## Relationships

```mermaid
erDiagram
    clients ||--o{ user : "has"
    clients ||--o{ insta_post : "posts"
    clients ||--o{ tiktok_post : "videos"
    insta_post ||--|| insta_like : "likes"
    tiktok_post ||--|| tiktok_comment : "comments"
    editorial_event ||--|| press_release_detail : "detail"
    editorial_event ||--o{ approval_request : "approvals"
    editorial_event ||--o{ change_log : "history"
```

The diagram shows how each `client` owns many `user`, `insta_post` and
`tiktok_post` records. Instagram and TikTok posts have one-to-one tables for
likes and comments. Editorial events maintain optional press-release details and
multiple approval/change log entries.

## PostgreSQL Table Management

Use the SQL scripts inside the [`sql`](../sql) directory to create the tables:

```bash
psql -U <dbuser> -d <dbname> -f sql/schema.sql
```

To remove tables no longer in use, run `DROP TABLE` via `psql` (add `IF EXISTS`
to avoid errors):

```bash
psql -U <dbuser> -d <dbname> -c "DROP TABLE IF EXISTS old_table_name;"
```

Repeat the command for each unused table. Always ensure a recent backup exists
before dropping tables.

Refer to [docs/naming_conventions.md](naming_conventions.md) for code style guidelines.

### `satbinmas_official_accounts`
Stores the verified Satbinmas social media handles for each client so they can be audited separately from generic client metadata.
- `satbinmas_account_id` – UUID primary key generated via `gen_random_uuid()`
- `client_id` – foreign key referencing `clients(client_id)` with cascade delete to remove linked accounts automatically when a client is deleted
- `platform` – lowercase text tag for the social platform (e.g. `instagram`, `tiktok`); a `(client_id, platform)` pair must be unique
- `username` – trimmed handle as entered by an operator
- `is_active` – boolean flag defaulting to `TRUE`; interpreted via service-side parsing helpers that accept booleans, `0/1`, or user-friendly strings such as `yes/no`
- `created_at`, `updated_at` – timestamps maintained by the database trigger `satbinmas_official_accounts_set_updated_at`

