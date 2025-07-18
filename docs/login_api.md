# Login API Guide

*Last updated: 2025-07-18*

This document explains how clients, regular users and dashboard operators authenticate with the backend. Available endpoints:
`/api/auth/login` for client operators,
`/api/auth/user-login` and `/api/auth/user-register` for regular users,
`/api/auth/dashboard-register` and `/api/auth/dashboard-login` for the web dashboard.
All return a JSON Web Token (JWT) that must be included in subsequent requests.

## 1. Payload Format

### Client Login
`POST /api/auth/login`
```json
{
  "client_id": "demo_client",
  "client_operator": "628123456789"
}
```

### User Login
`POST /api/auth/user-login`
```json
{
  "nrp": "123456",
  "whatsapp": "628123456789"
}
```

### User Registration
`POST /api/auth/user-register`
```json
{
  "nrp": "123456",
  "nama": "Budi",
  "client_id": "demo_client",
  "whatsapp": "628123456789"
}
```

### Dashboard Login
`POST /api/auth/dashboard-login`
```json
{
  "username": "admin",
  "password": "secret"
}
```

To register a dashboard user send a similar payload to `/api/auth/dashboard-register` with optional `role` and `client_id`.
Every new dashboard account is created with `status` set to `false` and an approval request is sent to the WhatsApp administrators. They can approve using `approvedash#<id>`.


## 2. Example `curl`

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"client_id":"demo_client","client_operator":"628123456789"}'
```

A successful response looks like:
```json
{
  "success": true,
  "token": "<JWT>",
  "client": { "client_id": "demo_client", "nama": "Demo", "role": "client" }
}
```
The token is also delivered as an HTTP-only cookie named `token`.

## 3. Token Flow

1. The client or user submits credentials to the appropriate endpoint.
2. The backend verifies the data and generates a JWT valid for two hours.
3. The token is stored in Redis and returned in the response as well as the cookie.
4. For later API calls, include the token in the `Authorization: Bearer` header or let the cookie be sent automatically.
5. Every successful login event is reported to the WhatsApp administrators.
6. When the token expires or is removed from Redis, a new login is required.
