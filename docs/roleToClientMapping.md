# Role to Client Behavior

This guide outlines how session roles map to client data and how the `roleFlag` option scopes dashboard reports.

## Roles

- **admin** – unrestricted; can request data for any client. Rekap handlers receive `roleFlag: 'admin'` and treat it as unfiltered access.
- **Directorate roles** (e.g. `DITBINMAS`, `DITLANTAS`, `BIDHUMAS`) – `session.role` equals the directorate ID. Rekap handlers aggregate across subordinate clients and use `roleFlag` to query with `getUsersByDirektorat`.
- **Client roles** – regular users tied to specific clients. Their `session.role` is forwarded as `roleFlag` so rekap handlers call `getUsersByClient(clientId, roleFlag)` and limit results to that role.

## Dashboard flow

1. `dashRequestHandlers` stores the current role on `session.role`.
2. `performAction` passes this value as `roleFlag` to the selected rekap handler.
3. Rekap handlers use `roleFlag` to filter users: either by client (`getUsersByClient`) or directorate (`getUsersByDirektorat`).
4. If `session.role` is missing, the handlers fall back to `session.user.role` ensuring accurate filtering.

Maintaining this mapping guarantees that each dashboard user sees only the content permitted for their role.
