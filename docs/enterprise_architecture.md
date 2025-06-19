# Cicero Enterprise Architecture
*Last updated: 2026-03-01*

This document provides a high level overview of the architecture behind Cicero Web, consisting of a **backend** service (`Cicero_V2`) and a **Next.js** based dashboard (`cicero-dashboard`).

## Overview

- **Frontend**: Next.js application located in `cicero-dashboard` (see the [Cicero Web repository](https://github.com/cicero78M/Cicero_Web)).
- **Backend**: Node.js/Express REST API located in this repository.
- **Database**: PostgreSQL (with optional support for MySQL or SQLite via the database adapter).
- **Queue**: RabbitMQ for high‑volume asynchronous jobs.
- **Cache/Session**: Redis for caching and session storage.
- **Messaging**: WhatsApp integration via `whatsapp-web.js` library.
- **External APIs**: Instagram and TikTok data fetched through RapidAPI.

## Components

### Backend (`Cicero_V2`)

The backend exposes REST endpoints to manage clients, users, and social media analytics. Key modules include:

- `app.js` – Express entry point registering middleware, routes, and scheduled cron jobs.
- `src/controller` – Implements CRUD logic for clients and users.
- `src/service` – Background jobs (cron), API fetchers, WhatsApp notifications, and RabbitMQ helpers.
- `src/routes` – Organizes API endpoints for authentication, clients, users, Instagram, TikTok, and dashboard stats.
- `src/model` – Database models representing clients, users, Instagram posts/likes, and TikTok posts/comments.
- `src/config` – Environment management (`env.js`) and Redis connection (`redis.js`).

### Frontend (`cicero-dashboard`)

Located in the separate `Cicero_Web/cicero-dashboard` directory. The dashboard communicates with the backend using helper functions defined in `utils/api.ts`. Key aspects:

- Built with Next.js 14 using TypeScript and Tailwind CSS.
- Custom React hooks and context provide authentication and global state management.
- Pages under `app/` render analytics views for Instagram and TikTok, user directories, and client info.
- Environment variable `NEXT_PUBLIC_API_URL` configures the backend base URL.

## Integration Flow

1. **Authentication**
   - User logs in via the dashboard, which sends credentials to `/api/auth/login` on the backend.
   - Backend returns a JWT token stored in `localStorage` on the frontend.
   - Subsequent requests attach `Authorization: Bearer <token>` header.

2. **Data Retrieval**
   - Dashboard calls backend endpoints (e.g., `/api/insta/rapid-posts`) using the helper functions in `utils/api.ts`.
   - Backend fetches data from RapidAPI (Instagram/TikTok) if necessary and stores results in PostgreSQL and Redis cache.
   - Responses are normalized so the frontend receives consistent field names regardless of the upstream API format.

3. **Notifications**
   - Cron jobs run in the backend to periodically fetch new posts, calculate stats, and send WhatsApp notifications to administrators.

4. **Queue Processing**
   - High‑volume tasks can be published to RabbitMQ using `src/service/rabbitMQService.js` for asynchronous processing.

## Deployment Considerations

- Both frontend and backend are Node.js applications and can run on the same host or separately.
- Environment variables are managed via `.env` files (`.env` for backend, `.env.local` for frontend).
- Use PM2 for clustering and process management in production.
- Monitor PostgreSQL, Redis, and RabbitMQ health for reliability.

## Diagram

Below is a conceptual diagram of the main components and their interactions:

```
+-------------+      HTTPS       +--------------+
|  Browser    | <--------------> |  Next.js UI  |
+-------------+                  +--------------+
        |                               |
        | REST API calls                 | fetch() via utils/api.ts
        v                               v
+-------------+     Express      +----------------+
|  Backend    | <--------------> |  PostgreSQL DB |
|  (Node.js)  |                  +----------------+
+-------------+
     |  ^            Redis & RabbitMQ            ^
     |  |--------------------------------------- |
     |        External Services (Instagram, TikTok, WhatsApp)
     |             via RapidAPI & whatsapp-web.js
```

The frontend communicates only with the backend. The backend orchestrates data retrieval, persistence, caching, and messaging integrations.


Petunjuk penamaan kode dapat ditemukan di [docs/naming_conventions.md](naming_conventions.md).
