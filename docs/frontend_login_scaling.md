# Frontend Login Scaling Scenario

*Last updated: 2025-07-18*

This guide describes a secure approach for handling login and registration on the web dashboard. It introduces a dedicated table `dashboard_user` so credentials are separated from the existing `user` table. The workflow aligns with the current JWT authentication model used across Cicero_V2.

## 1. Database Table

```sql
CREATE TABLE dashboard_user (
  user_id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  status BOOLEAN DEFAULT TRUE,

  client_id VARCHAR REFERENCES clients(client_id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

- `user_id` is generated with `uuid.v4()`.
- `password_hash` stores a bcrypt hash of the plaintext password.
- `role` can be `admin`, `operator` or other roles required by the dashboard.
- `status` is `true` when the account is active. Admin registrations start as `false` and must be approved via WhatsApp.

- `client_id` links an account to a specific organisation if needed.

## 2. Registration Endpoint

Expose `/api/auth/dashboard-register`:

1. Validate `username`, `password` and optional `role` and `client_id`.
2. Ensure the username is unique in `dashboard_user`.
3. Hash the password with `bcrypt.hash` and insert the new row with `status=false`.
4. Send a WhatsApp notification to administrators. They can approve using `approvedash#<id>` or reject with `denydash#<id>`.
5. Return `201 Created` with the new `user_id` and current status.


## 3. Login Endpoint

Expose `/api/auth/dashboard-login`:

1. Validate `username` and `password`.
2. Fetch the record from `dashboard_user` and verify the password with `bcrypt.compare`.
3. On success generate a JWT containing `user_id` and `role`.
4. Store the token in Redis with a two-hour expiry and return it in the response and as a `token` cookie.
5. Every successful login is reported to administrators via WhatsApp for auditing purposes.

## 4. Middleware

Create `verifyDashboardToken` to protect private routes:

1. Check the `Authorization` header or `token` cookie.
2. Verify the JWT using `process.env.JWT_SECRET` and confirm the token exists in Redis.
3. Attach `req.dashboardUser` to the request object on success.

## 5. Scaling Notes

- Use HTTPS in production and enforce rate limiting on the login routes.
- Store active tokens in Redis so the backend can invalidate sessions at any time.
- Index `username` and `user_id` in the database to keep lookups fast when the number of users grows.
- Log login attempts to monitor suspicious behaviour and audit access.

This setup mirrors the `penmas_user` flow and fits the current architecture, allowing the web frontend to scale independently from the mobile app login system.
