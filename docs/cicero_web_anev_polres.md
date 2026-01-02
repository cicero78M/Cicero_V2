# Cicero_Web: Anev Polres Navigation and Access

Use this note to align the Next.js dashboard (`Cicero_Web`) with the backend `GET /api/dashboard/anev` endpoint. The goal is to make the “Anev Polres” entry in the sidebar/menu point at the correct route and keep premium access rules in sync with the API.

## Navigation Link
- **Menu label**: `Anev Polres`
- **Route**: `/dashboard/anev`
- **Where to edit**: The dashboard stores navigation entries in its menu/constant files (e.g., `src/constants/menu.ts` or a sidebar component under `src/components`). Update the Anev item so its `href`/`path` is `/dashboard/anev`.
- **Active state**: Ensure the menu component checks the current pathname (via Next.js router) so `/dashboard/anev` highlights the Anev Polres item when active.

## Access Control
- Backend enforcement uses `dashboardPremiumGuard` with allowed tiers `tier1` and `tier2`. Mirror this in any frontend route guard or feature-flag checks so both tiers can open `/dashboard/anev`.
- The page should require a signed dashboard token before rendering data, consistent with other premium dashboard pages.

## API Call
The Anev Polres page should load data from:

```
GET /api/dashboard/anev
```

Include these query parameters:
- `client_id` (required; match the user’s permitted clients or send `X-Client-Id` header).
- `role` (required; e.g., `ditbinmas`).
- `scope` (required; `org` or `direktorat`).
- `regional_id` (optional; uppercase string when provided).
- Time range: `time_range` (`today`, `7d` default, `30d`, `90d`, `custom`, `all`). For `custom`, supply `start_date` and `end_date` in Asia/Jakarta timezone.

Example fetch call (Next.js/TypeScript):

```ts
await apiClient.get("/api/dashboard/anev", {
  params: {
    client_id,
    role,
    scope,
    regional_id,
    time_range: "30d",
  },
});
```

Keep this document in sync whenever the navigation label, route, or premium rules change so the dashboard and backend stay aligned.
