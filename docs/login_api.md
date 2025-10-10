# Login API Guide

*Last updated: 2025-10-21*

This document explains how clients, regular users and dashboard operators authenticate with the backend. Available endpoints:
- `/api/auth/login` for client operators,
- `/api/auth/user-login` and `/api/auth/user-register` for regular users,
- `/api/auth/dashboard-register` and `/api/auth/dashboard-login` for the web dashboard,
- `/api/auth/dashboard-password-reset/request` and `/api/auth/dashboard-password-reset/confirm` for dashboard password recovery (aliases available at `/api/auth/password-reset/request` and `/api/auth/password-reset/confirm`).

All return a JSON Web Token (JWT) that must be included in subsequent requests unless noted otherwise.

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

> **Note:** For legacy Android clients, the `password` field may be used instead of `whatsapp`. Both are treated equivalently.

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

### Dashboard Registration
`POST /api/auth/dashboard-register`
```json
{
  "username": "admin",
  "password": "secret",
  "whatsapp": "628123456789",
  "client_id": "demo_client",
  "role": "operator"
}
```

The `whatsapp` field should contain digits only; any non-numeric characters will be removed before storage.

### Dashboard Login
`POST /api/auth/dashboard-login`
```json
{
  "username": "admin",
  "password": "secret"
}
```

Every new dashboard account is created with `status` set to `false` and an approval request containing the username, ID, role, WhatsApp number, and client ID is sent to the WhatsApp administrators. They can approve using `approvedash#<username>` or reject with `denydash#<username>`.

### Dashboard Password Reset Request
`POST /api/auth/dashboard-password-reset/request` *(alias: `/api/auth/password-reset/request`)*
```json
{
  "username": "admin",
  "contact": "08123456789"
}
```

The backend normalises the contact number to start with `62` and validates that it matches the stored WhatsApp number for the specified username. When valid, a reset token that expires after 15 minutes is created and the operator receives a WhatsApp message containing the reset instructions.

Successful response:
```json
{
  "success": true,
  "message": "Instruksi reset password telah dikirim melalui WhatsApp."
}
```

If WhatsApp delivery fails, administrators are alerted and the API responds with a message instructing the operator to contact the admin for manual assistance.

### Dashboard Password Reset Confirmation
`POST /api/auth/dashboard-password-reset/confirm` *(alias: `/api/auth/password-reset/confirm`)*
```json
{
  "token": "63e80f9a-3e63-4ad4-8a69-7c7f4d92721e",
  "password": "Newpass123",
  "confirmPassword": "Newpass123"
}
```

The backend checks that the token exists, has not expired, and has not been used. On success the dashboard password hash is replaced, the token is marked as used, and all existing dashboard login sessions in Redis are cleared so the operator must log in again.

Successful response:
```json
{
  "success": true,
  "message": "Password berhasil diperbarui. Silakan login kembali."
}
```

Example error (expired token or mismatched confirmation):
```json
{
  "success": false,
  "message": "token reset tidak valid atau sudah kedaluwarsa"
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
5. Every successful login event is reported to the WhatsApp administrators.
6. When the token expires or is removed from Redis, a new login is required.
7. Dashboard password resets invalidate existing dashboard login sessions before returning a success response.
