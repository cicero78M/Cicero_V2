# Premium Subscription

This simplified design stores subscription details directly in `instagram_user`.
Each user profile has:

- `premium_status` – boolean flag, `true` when the user has access.
- `premium_end_date` – optional expiry date.

Administrators update these fields via internal tools or scripts. Protected
routes check the values from `instagram_user` to determine access.
