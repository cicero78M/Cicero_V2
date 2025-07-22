import { query } from '../repository/db.js';

export async function createRequest(data) {
  const res = await query(
    `INSERT INTO premium_request (user_id, screenshot_url, status, created_at, updated_at)
     VALUES ($1, $2, $3, COALESCE($4, NOW()), COALESCE($5, NOW()))
     RETURNING *`,
    [data.user_id, data.screenshot_url || null, data.status || 'pending', data.created_at || null, data.updated_at || null]
  );
  return res.rows[0];
}

export async function findRequestById(id) {
  const res = await query('SELECT * FROM premium_request WHERE request_id=$1', [id]);
  return res.rows[0] || null;
}

export async function updateRequest(id, data) {
  const old = await findRequestById(id);
  if (!old) return null;
  const merged = { ...old, ...data };
  const res = await query(
    `UPDATE premium_request SET
      user_id=$2,
      screenshot_url=$3,
      status=$4,
      updated_at=COALESCE($5, NOW())
     WHERE request_id=$1 RETURNING *`,
    [id, merged.user_id, merged.screenshot_url, merged.status, data.updated_at || null]
  );
  return res.rows[0];
}

export async function expireOldRequests(hours = 3) {
  await query(
    `UPDATE premium_request SET status='expired', updated_at=NOW()
     WHERE status='pending' AND created_at <= NOW() - INTERVAL '${hours} hours'`
  );
}
