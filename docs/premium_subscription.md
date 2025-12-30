# Premium Subscription

Premium subscription data is stored in the `user` table and mirrored for dashboard
users.

Each `user` record includes:

- `premium_status` – boolean flag, `true` when the user has access.
- `premium_end_date` – optional expiry date.

Dashboard users can have structured subscription records in
`dashboard_user_subscriptions` with:

- `subscription_id` (UUID) – primary key.
- `dashboard_user_id` – references `dashboard_user`.
- `tier` – subscription tier label.
- `status` – current state (for example `active`, `pending`, `canceled`).
- `started_at` – start timestamp (defaults to `now()`).
- `expires_at` – expiry timestamp.
- `canceled_at` – optional cancelation timestamp.
- `metadata` – optional JSONB payload for provider details.

For quick access, `dashboard_user` also tracks:

- `premium_status` – boolean flag, `true` when the subscription is active.
- `premium_tier` – latest tier label.
- `premium_expires_at` – cached expiry timestamp.

Routes that validate dashboard-user access should first read the cached
`dashboard_user` columns and only fall back to `dashboard_user_subscriptions`
when detailed history is required.

## Data Access Helpers

- `src/model/dashboardSubscriptionModel.js` provides basic CRUD helpers:
  - `create`, `findActiveByUser`, `expire`, `cancel`, and `renew` rely on
    parameterized queries.
- `src/service/dashboardSubscriptionService.js` wraps subscription mutations
  in lightweight transactions and updates the cached premium fields on
  `dashboard_user` to keep login responses aligned with the latest state.

During dashboard login, premium status, tier, and expiry are attached to
the JWT payload using the cached columns or the latest active subscription.

## Expiry enforcement

- `src/service/dashboardSubscriptionExpiryService.js` filters active subscription
  rows whose `expires_at` is past the current time, expires them through
  `expireSubscription`, refreshes the dashboard cache, and sends a WhatsApp
  alert via the gateway client when a destination number is available.
- `src/cron/cronDashboardSubscriptionExpiry.js` schedules the expiry sweep every
  30 minutes (Asia/Jakarta) using `scheduleCronJob`; the module is loaded through
  the cron manifest so WhatsApp readiness checks are honored before delivery.

## Premium Request Workflow

Mobile users from the `pegiat_medsos_apps` can request a premium
subscription through the `/premium-requests` API. A request is created with the
name of the account holder, the account number and the originating bank. After
the user transfers the fee they upload the proof of payment and confirm the
request. Only at this confirmation stage does the system notify the
administrators via WhatsApp.
 
Administrators approve by replying `grantsub#<id>` or reject with
`denysub#<id>`. Approval sets `premium_status` to `true` for the user.

## Dashboard premium access requests

Dashboard operators can now submit premium access requests directly from the
web dashboard via the protected endpoint:

- `POST /dashboard/premium-access/requests`
  - Requires a valid `verifyDashboardToken` cookie/header.
  - Body parameters:
    - `bank_name` – originating bank for the transfer (string, required).
    - `account_number` – destination account number (string, required).
    - `sender_name` – name on the sending account (string, required).
    - `transfer_amount` – amount transferred in rupiah (number, required).
  - On success, the API stores a row in `dashboard_premium_request` that
    includes the dashboard user's `username`, `whatsapp`, and identifiers for
    traceability. The response returns the saved record alongside metadata about
    WhatsApp delivery attempts to administrators.

### WhatsApp notification format

When a request is created, the system waits for the WhatsApp client to be
ready (`waitForWaReady`) and notifies admins (using `safeSendMessage` and
`formatToWhatsAppId`) with a payload shaped like:

```
📢 permintaan akses premium

User dashboard:
- Username: <username>
- WhatsApp: <62xxxx@c.us>
- Dashboard User ID: <uuid>

Detail transfer:
- Bank: <bank>
- Nomor Rekening: <account_number>
- Nama Pengirim: <sender_name>
- Jumlah Transfer: RpXXX.XXX

Request ID: <request_id>
```

Admins receive the message on the numbers configured in `ADMIN_WHATSAPP` and
can use the included identifiers to continue the premium enablement flow.

### WhatsApp admin commands for dashboard requests

Dashboard premium requests can now be approved or rejected directly from
WhatsApp:

- `grantaccess#<username>` – approves the latest pending dashboard premium
  request for `<username>`, creates a 30-day `dashboard_user_subscriptions`
  record with tier `premium`, updates the cached premium fields on
  `dashboard_user`, and notifies the requester via WhatsApp.
- `dennyaccess#<username>` / `denyaccess#<username>` – rejects the pending
  request and alerts the requester via WhatsApp.

Every admin action inserts a row into `dashboard_premium_request_audit`
including the admin's WhatsApp number and chat ID for traceability.

### New dashboard request endpoint

Dashboard web users can submit the premium form through a dedicated route that
accepts the updated payload from the UI:

- `GET /premium/request/context`
  - Requires a dashboard session token validated by `verifyDashboardToken`.
  - Returns the authenticated dashboard username plus identifiers that the
    updated premium form can use automatically:
    - `username` – taken from the dashboard session.
    - `dashboard_user_id` – returned for completeness so the UI can display who
      is submitting the request without exposing a UUID field. The dashboard
      request table has dropped the legacy `user_id` column, so the flow relies
      on dashboard identifiers plus usernames for traceability.
- `POST /premium/request`
  - Requires a dashboard session token validated by `verifyDashboardToken`
    (Bearer header or `token` cookie). The middleware also checks the Redis
    prefix to ensure the token represents a dashboard session.
- Body parameters:
  - `username` – username submitted by the form (string, optional; falls back
    to the authenticated dashboard user when omitted). When the submitted
    username differs from the authenticated dashboard user, the request is
    rejected with `403` to prevent impersonation.
  - `client_id` validation now derives allowed IDs from the authenticated
    dashboard user's `client_ids` list and intersects it with any client IDs
    present in the dashboard token. Requests must use a `client_id` from this
    validated set; mismatches return `403` before any database calls to keep
    row-level security intact. The handler also emits a warning log with the
    dashboard user context and rejected `client_id` to help trace misaligned
    dashboard sessions.
  - `client_id` – client identifier for the dashboard session (string,
    optional, stored for traceability).
  - `premium_tier` – tier label requested by the dashboard user (string,
    optional, persisted and forwarded to admins).
    - `bank_name` – originating bank for the transfer (string, required).
    - `account_number` – destination account number (string, required).
    - `sender_name` – name on the sending account (string, required).
    - `amount` / `transfer_amount` – amount transferred in rupiah (number,
      required; both field names are accepted).
  - The handler now resolves `client_id` from the request body, the dashboard
    token payload, or the sole client assigned to the dashboard user. Requests
    without a resolvable `client_id` return `400`, while client IDs that are not
    associated with the authenticated dashboard user return `403`. This
    validation ensures the insert complies with database row-level security
    policies.
  - The API pairs the resolved `client_id` with the authenticated
    `dashboard_user_id` and username to build Postgres session settings. When
    a submitted username does not match the authenticated dashboard user, the
    handler returns `403` before hitting the database, and RLS violations on
    insert are translated to a `403` response so dashboard operators receive
    actionable feedback.
  - The endpoint stores `premium_tier`, `client_id`, the resolved `username`,
    and the submitted amount field name inside `dashboard_premium_request.metadata`
    for traceability, while also persisting normalized columns for filtering.
    Legacy `user_id` data is no longer stored; incoming metadata is sanitized
    to drop any `userId`/`user_id` keys before insertion.
  - Admin WhatsApp notifications now include the requested tier, client ID,
    username, and dashboard user ID alongside the transfer details. When the
    form omits a username, the backend defaults to the authenticated dashboard
    user's value so the UI no longer needs to expose a UUID input.
  - `dashboard_user_id` in the payload is ignored when the dashboard token
    already contains a valid identifier; malformed IDs now return `400` before
    touching the database to prevent empty strings from violating UUID checks
    in `dashboard_premium_audit`. The handler prefers the authenticated
    dashboard user ID for all downstream calls.
  - The insert path sets Postgres session settings (`app.current_client_id`,
    `app.current_dashboard_user_id`, `app.current_username`,
    and `app.current_user_uuid`) inside a transaction via
    `dashboardPremiumRequestModel.createRequest`. Keep these up to date when
    adding new RLS-protected fields so row-level security stays satisfied. The
    transaction uses `set_config` with parameter binding to avoid raw string
    concatenation in `SET` statements and prevent Postgres parse errors on bound
    values. The session-setting step runs automatically when `DB_DRIVER` is set
    to Postgres-friendly values (`postgres`, `postgresql`, or `pg`); other
    drivers skip this to avoid errors on non-Postgres adapters.

### Auto-expiry for unattended dashboard requests

Pending dashboard premium requests now expire automatically after 60 minutes:

- `src/service/dashboardPremiumRequestExpiryService.js` queries pending
  `dashboard_premium_request` rows older than the threshold, updates the status
  to `expired` only if the row is still pending, and writes an
  `dashboard_premium_request_audit` entry with the action `expired` for
  traceability. When a WhatsApp number is available, the service attempts to
  inform the applicant via the gateway client so they can resubmit.
- `src/cron/cronDashboardPremiumRequestExpiry.js` schedules the sweep every 10
  minutes (Asia/Jakarta) through `scheduleCronJob` and reports how many stale
  requests were checked, expired, and notified.

### Client ID validation and RLS session settings

- The dashboard premium request controller now sets Postgres session settings
  (`app.current_client_id`, `app.current_dashboard_user_id`,
  `app.current_user_uuid`, and `app.current_username`) before selecting dashboard
  users and their `client_ids`. This keeps `dashboard_user_clients` lookups RLS
  compliant even when older dashboard tokens do not include `client_id` claims,
  preventing 42501 errors during these reads.
- `client_id` resolution follows the stricter validation flow:
  - Missing `client_id` across the request body, token claims, and dashboard profile:
    `400` with `client_id wajib diisi atau akun dashboard harus memiliki satu client aktif`.
  - `client_id` not in the authenticated dashboard user's allowed list: `403`
    with `client_id tidak sesuai dengan akses dashboard user` and a warning log
    containing the token and resolved context for traceability.
  - Submitted `username` mismatching the authenticated dashboard user: `403`
    with `username tidak sesuai dengan akun dashboard yang aktif`.
- Invalid or absent dashboard tokens continue to return `401` with `Token dashboard tidak valid`
  or `Token required` prior to any database calls.
- When an insert trips row-level security, the controller now emits a structured error log
  containing the dashboard user ID, resolved `client_id`, allowed client IDs, session settings,
  and the resolved username. The API still returns `403` but expands the message to nudge
  operators to verify dashboard token claims and client access so support teams can diagnose
  misconfigured sessions quickly.

### Token testing notes and troubleshooting

- When testing with older dashboard tokens lacking the `client_id` claim, confirm the middleware
  still sets `app.current_dashboard_user_id` from the token payload; the controller now injects
  this into session settings so selecting `dashboard_user` and `dashboard_user_clients` remains
  compliant with RLS policies.
- For new tokens containing `client_id` or `client_ids`, the session settings mirror the claims
  and the controller intersects them with the database assignments before allowing inserts,
  keeping select and insert paths aligned.
- If an unexpected `42501` appears during manual calls, verify:
  - The token is stored in Redis with the `dashboard:` prefix (required by `verifyDashboardToken`).
  - `DB_DRIVER` is set to a Postgres-compatible value so `set_config` calls run.
  - The token's `client_id(s)` match the `dashboard_user_clients` rows for the authenticated
    dashboard user.
