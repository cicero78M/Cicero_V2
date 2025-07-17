import { query } from '../repository/db.js';

export async function createSubscription(data) {
  const res = await query(
    `INSERT INTO premium_subscription (
        username, start_date, end_date, is_active, created_at
     ) VALUES ($1,$2,$3,$4,COALESCE($5, NOW()))
     RETURNING *`,
    [
      data.userId || data.username,
      data.start_date || new Date(),
      data.end_date || null,
      data.is_active ?? false,
      data.created_at || null,
    ],
  );
  return res.rows[0];
}

export async function getSubscriptions() {
  const res = await query(
    'SELECT * FROM premium_subscription ORDER BY created_at DESC',
  );
  return res.rows;
}

export async function findSubscriptionById(id) {
  const res = await query(
    'SELECT * FROM premium_subscription WHERE subscription_id=$1',
    [id],
  );
  return res.rows[0] || null;
}

export async function findActiveSubscriptionByUser(userId) {
  const res = await query(
    `SELECT * FROM premium_subscription
     WHERE username=$1 AND is_active = true
     ORDER BY start_date DESC LIMIT 1`,
    [userId],
  );
  return res.rows[0] || null;
}

export async function findLatestSubscriptionByUser(userId) {
  const res = await query(
    `SELECT * FROM premium_subscription
     WHERE username=$1
     ORDER BY start_date DESC LIMIT 1`,
    [userId],
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
      start_date=$3,
      end_date=$4,
      is_active=$5
     WHERE subscription_id=$1 RETURNING *`,
    [
      id,
      merged.userId || merged.username,
      merged.start_date,
      merged.end_date || null,
      merged.is_active,
    ],
  );
  return res.rows[0];
}

export async function deleteSubscription(id) {
  const res = await query(
    'DELETE FROM premium_subscription WHERE subscription_id=$1 RETURNING *',
    [id],
  );
  return res.rows[0] || null;
}
