# Premium Subscription

Premium subscription data is stored in the `user` table.
Each user record includes:

- `premium_status` – boolean flag, `true` when the user has access.
- `premium_end_date` – optional expiry date.

Administrators update these fields via internal tools or scripts. Protected
routes check the values from `user` to determine access.

## Premium Request Workflow

Mobile users from the `pegiat_medsos_apps` can request a premium
subscription through the `/premium-requests` API. A request is created with the
name of the account holder, the account number and the originating bank. After
the user transfers the fee they upload the proof of payment and confirm the
request. Only at this confirmation stage does the system notify the
administrators via WhatsApp.

Each request will automatically expire after three hours if no confirmation is
received. Administrators approve by replying `grantsub#<id>` or reject with
`denysub#<id>`. Approval sets `premium_status` to `true` for the user.

## Scheduled Maintenance

- `cronPremiumRequest.js` runs every 30 minutes to clean up premium requests that have not been confirmed within three hours.
- `cronPremiumSubscription.js` runs daily at midnight (00:00) to disable `premium_status` for users whose `premium_end_date` has passed.
