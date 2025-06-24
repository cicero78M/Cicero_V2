# Cicero Repository Suite Overview
*Last updated: 2026-04-01*

This document summarizes the three main repositories that make up the **Cicero** platform. Each repository has a specific role, but all work together to provide social media monitoring and reporting.

## Repositories

### 1. Cicero_V2 (Backend)
- Node.js/Express REST API used for monitoring Instagram and TikTok.
- Supports multi-client data collection and sends reports via WhatsApp.
- Cron jobs automate fetching posts and analytics.
- See [enterprise_architecture.md](enterprise_architecture.md) for architecture details.

### 2. Cicero_Web (Dashboard)
- Next.js dashboard found in the separate `Cicero_Web` repository.
- Communicates with the backend using helper functions in `utils/api.ts`.
- Pages under `app/` display Instagram and TikTok analytics as well as user directories.
- Configured through the `NEXT_PUBLIC_API_URL` environment variable.

### 3. pegiat_medsos_apps (Android App)
- Lightweight Android application for field agents.
- Uses a login screen to obtain a JWT from the backend.
- Displays profile information and Instagram posts for the logged in user.
- Provides a dashboard and reporting screen via simple activities.

## Integration Flow
1. The dashboard and Android app authenticate users against the backend API.
2. Both clients call endpoints such as `/api/insta/rapid-posts` to retrieve social media data.
3. Scheduled jobs in the backend collect posts and metrics, then send WhatsApp reminders and reports.
4. Heavy tasks can be processed asynchronously using RabbitMQ.

Together these repositories form a complete system: the backend orchestrates data collection and messaging, the Next.js dashboard presents analytics to administrators, and the Android app enables field personnel to interact with the same data while on the go.
