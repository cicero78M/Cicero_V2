# Login API Guide
*Last updated: 2026-04-01*

This document explains how clients and users authenticate with the backend. Two endpoints are provided: `/api/auth/login` for client operators and `/api/auth/user-login` for regular users. Both return a JSON Web Token (JWT) that must be included in subsequent requests.

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
5. When the token expires or is removed from Redis, a new login is required.
