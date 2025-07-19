import { query } from '../repository/db.js';

export async function createSubscription(data) {
  const res = await query(
    `INSERT INTO premium_subscription (
        username, status, start_date, end_date,
        order_id, snap_token, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, NOW()),COALESCE($8, NOW()))
     RETURNING *`,
    [
      data.username,
      data.status || 'active',
      data.start_date || new Date(),
      data.end_date || null,
      data.order_id || null,
      data.snap_token || null,
      data.created_at || null,
      data.updated_at || null,
    ]
  );
  return res.rows[0];
}

export async function getSubscriptions() {
  const res = await query(
    'SELECT * FROM premium_subscription ORDER BY created_at DESC'
  );
  return res.rows;
}

export async function findSubscriptionById(id) {
  const res = await query(
    'SELECT * FROM premium_subscription WHERE subscription_id=$1',
    [id]
  );
  return res.rows[0] || null;
}

export async function findActiveSubscriptionByUser(username) {
  const res = await query(
    `SELECT * FROM premium_subscription
     WHERE username=$1 AND status='active'
     ORDER BY start_date DESC LIMIT 1`,
    [username]
  );
  return res.rows[0] || null;
}

export async function findLatestSubscriptionByUser(username) {
  const res = await query(
    `SELECT * FROM premium_subscription
     WHERE username=$1
     ORDER BY start_date DESC LIMIT 1`,
    [username]
  );
  return res.rows[0] || null;
}

export async function updateSubscription(id, data) {
  const old = await findSubscriptionById(id);
  if (!old) return null;
  const merged = { ...old, ...data };
  const res = await query(
    `UPDATE premium_subscription SET
      username=$2,
      status=$3,
      start_date=$4,
      end_date=$5,
      order_id=$6,
      snap_token=$7,
      updated_at=COALESCE($8, NOW())
     WHERE subscription_id=$1 RETURNING *`,
    [
      id,
      merged.username,
      merged.status,
      merged.start_date,
      merged.end_date || null,
      merged.order_id || null,
      merged.snap_token || null,
      merged.updated_at || null,
    ]
  );
  return res.rows[0];
}

export async function deleteSubscription(id) {
  const res = await query(
    'DELETE FROM premium_subscription WHERE subscription_id=$1 RETURNING *',
    [id]
  );
  return res.rows[0] || null;
}
