# Premium Subscription

Premium subscription data is stored in the `user` table.
Each user record includes:

- `premium_status` – boolean flag, `true` when the user has access.
- `premium_end_date` – optional expiry date.

Administrators update these fields via internal tools or scripts. Protected
routes check the values from `user` to determine access.

## Premium Request Workflow

Mobile users from the `pegiat_medsos_apps` can request a premium
subscription through the `/premium-requests` API. Each request records the
screenshot of the payment and is stored in the `premium_request` table. The
request will automatically expire after three hours if no admin action is
taken.

When a request is created the system sends a WhatsApp notification to the
administrators. They can approve it by replying `grantsub#<id>` or reject it
with `denysub#<id>`. Approval sets `premium_status` to `true` for the user.
