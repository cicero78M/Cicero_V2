# Role to Client Behavior

This guide outlines how session roles map to client data and how the `roleFlag` option scopes dashboard reports.

## Roles

- **admin** – unrestricted; can request data for any client. Rekap handlers receive `roleFlag: 'admin'` and treat it as unfiltered access.
- **Directorate roles** (e.g. `DITBINMAS`, `DITLANTAS`, `BIDHUMAS`, `DITSAMAPTA`) – `session.role` equals the directorate ID. Rekap handlers aggregate across subordinate clients and use `roleFlag` to query with `getUsersByDirektorat`.
- **Client roles** – regular users tied to specific clients. Their `session.role` is forwarded as `roleFlag` so rekap handlers call `getUsersByClient(clientId, roleFlag)` and limit results to that role.
- **operator** – dashboard stats are always scoped to `req.user.client_id`. Any `client_id` provided in query string or headers is ignored, and missing `client_id` on the session is rejected.
- **Special BIDHUMAS override** – dashboard users whose sole `client_id` adalah `DITSAMAPTA` namun perannya `BIDHUMAS` akan mempertahankan `session.role = 'bidhumas'` agar pemetaan downstream tetap merujuk ke BIDHUMAS. JWT login claims also emit `role: 'bidhumas'` for this combination, and aggregator requests pre-emptively resolve `DITSAMAPTA` to the BIDHUMAS org client so the experience mirrors BIDHUMAS rather than the directorate default. Kombinasi lain tetap mengikuti aturan di atas.

## Dashboard flow

1. `dashRequestHandlers` stores the current role on `session.role`.
2. `performAction` passes this value as `roleFlag` to the selected rekap handler.
3. Rekap handlers use `roleFlag` to filter users: either by client (`getUsersByClient`) or directorate (`getUsersByDirektorat`).
4. If `session.role` is missing, the handlers fall back to `session.user.role` ensuring accurate filtering.

Maintaining this mapping guarantees that each dashboard user sees only the content permitted for their role.

### User directory and listing endpoints

`GET /users/list` now recognizes `client_id=DITSAMAPTA` the same way as other directorate clients. Requests targeting `DITSAMAPTA` are routed through `getUsersByDirektorat`, so admins and directorate users can pull directory listings for DITSAMAPTA-flagged accounts without using the ORG client alias.

Operators are also allowed to call `GET /users/list`. The handler now supports multi-client operator tokens: if a `client_id` query param is provided it must match (case-insensitive) one of the `req.user.client_ids`, otherwise a single `client_id` in the token is used as the default. Requests for a `client_id` outside the token list are rejected with HTTP 403 (`client_id tidak diizinkan`) to keep listings scoped to authorized clients.

`GET /users/by-client/:client_id` and `GET /users/by-client-full/:client_id` always pass the authenticated `role` as `roleFilter`. For operator logins this forces the user query to require `role_name = 'operator'` in `user_roles`, ensuring the response only includes operator personnel tied to the requested client. Operator requests must also target a `client_id` that exists in `req.user.client_id` or `req.user.client_ids`; otherwise the API returns HTTP 403.

Example error response:

```json
{
  "success": false,
  "message": "client_id tidak diizinkan"
}
```
