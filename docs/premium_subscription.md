# Premium Subscription

Premium subscription data is stored in the `user` table.
Each user record includes:

- `premium_status` – boolean flag, `true` when the user has access.
- `premium_end_date` – optional expiry date.

Administrators update these fields via internal tools or scripts. Protected
routes check the values from `user` to determine access.
