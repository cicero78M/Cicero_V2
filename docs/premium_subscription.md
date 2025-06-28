# Premium Subscription Workflow
*Last updated: 2026-04-01*

This document outlines how the Android app can restrict the Instagram page to paying customers.
It covers the suggested API endpoints, database structure and how Midtrans is used for payments.

## Database Table

Create a new table called `premium_subscription`:

```sql
CREATE TABLE premium_subscription (
  subscription_id SERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES instagram_user(user_id),
  status VARCHAR NOT NULL,
  start_date DATE,
  end_date DATE,
  order_id VARCHAR,
  snap_token VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

- `status` values should be `pending`, `active`, `expired` or `cancelled`.
- `order_id` and `snap_token` store the Midtrans transaction identifiers.
- Rows are updated when Midtrans sends payment notifications.

## API Scenario

1. **Initiate Checkout**
   - `POST /api/subscription/checkout`
   - Body: `{ user_id, plan }`
   - Server calls Midtrans Snap API and returns a `snap_token` and `order_id`.
2. **Midtrans Callback**
   - `POST /api/subscription/webhook`
   - Midtrans sends transaction status. Verify the signature then update `premium_subscription.status`.
3. **Check Status**
   - `GET /api/subscription/status`
   - Returns the active subscription record for the authenticated user.
4. **Protect Routes**
   - Middleware `premiumRequired` queries `premium_subscription` and only allows access when `status='active'` and `end_date` is in the future. Apply this middleware to `/api/insta/*` routes for the mobile app.

## Midtrans Integration

Use the [Midtrans Snap API](https://docs.midtrans.com/docs/snap-overview) for payment processing:

```javascript
import midtransClient from 'midtrans-client';

const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_PROD === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

export async function createTransaction(orderId, amount, customer){
  const parameters = {
    transaction_details: { order_id: orderId, gross_amount: amount },
    customer_details: customer,
  };
  const { token } = await snap.createTransaction(parameters);
  return token;
}
```

- Store `MIDTRANS_SERVER_KEY` and `MIDTRANS_CLIENT_KEY` in `.env`.
- After payment Midtrans will hit the webhook URL to confirm the status.

With this setup the backend can determine whether the user has an active subscription before serving Instagram data.
