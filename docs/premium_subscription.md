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

## Premium Request Workflow

Mobile users from the `pegiat_medsos_apps` can request a premium
subscription through the `/premium-requests` API. A request is created with the
name of the account holder, the account number and the originating bank. After
the user transfers the fee they upload the proof of payment and confirm the
request. Only at this confirmation stage does the system notify the
administrators via WhatsApp.
 
Administrators approve by replying `grantsub#<id>` or reject with
`denysub#<id>`. Approval sets `premium_status` to `true` for the user.
