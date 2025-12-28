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
