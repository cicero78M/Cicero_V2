import { query } from '../repository/db.js';

export async function createRequest(payload) {
  const res = await query(
    `INSERT INTO dashboard_premium_request (
      dashboard_user_id,
      user_id,
      username,
      whatsapp,
      bank_name,
      account_number,
      sender_name,
      transfer_amount,
      status,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'pending'), COALESCE($10, NOW()), COALESCE($11, NOW())
    )
    RETURNING *`,
    [
      payload.dashboardUserId,
      payload.userId || null,
      payload.username,
      payload.whatsapp || null,
      payload.bankName,
      payload.accountNumber,
      payload.senderName,
      payload.transferAmount != null ? Number(payload.transferAmount) : null,
      payload.status,
      payload.createdAt || null,
      payload.updatedAt || null,
    ],
  );

  return res.rows[0];
}

export async function findLatestPendingByUsername(username) {
  const res = await query(
    `SELECT *
     FROM dashboard_premium_request
     WHERE LOWER(username) = LOWER($1)
       AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [username],
  );

  return res.rows[0] || null;
}

export async function findById(requestId) {
  const res = await query(
    `SELECT * FROM dashboard_premium_request WHERE request_id = $1`,
    [requestId],
  );
  return res.rows[0] || null;
}

export async function updateStatus(requestId, status, updatedAt = null) {
  const res = await query(
    `UPDATE dashboard_premium_request
     SET status = $2,
         updated_at = COALESCE($3, NOW())
     WHERE request_id = $1
     RETURNING *`,
    [requestId, status, updatedAt],
  );

  return res.rows[0] || null;
}

export async function updateStatusIfPending(requestId, status, updatedAt = null) {
  const res = await query(
    `UPDATE dashboard_premium_request
     SET status = $2,
         updated_at = COALESCE($3, NOW())
     WHERE request_id = $1
       AND status = 'pending'
     RETURNING *`,
    [requestId, status, updatedAt],
  );

  return res.rows[0] || null;
}

export async function findPendingOlderThanMinutes(minutes = 60) {
  const res = await query(
    `SELECT *
     FROM dashboard_premium_request
     WHERE status = 'pending'
       AND created_at <= NOW() - ($1 * INTERVAL '1 minute')
     ORDER BY created_at ASC`,
    [minutes],
  );

  return res.rows || [];
}

export async function insertAuditLog({
  requestId,
  action,
  adminWhatsapp,
  adminChatId,
  note = null,
  createdAt = null,
}) {
  const res = await query(
    `INSERT INTO dashboard_premium_request_audit (
      request_id,
      action,
      admin_whatsapp,
      admin_chat_id,
      note,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
    RETURNING *`,
    [requestId, action, adminWhatsapp || null, adminChatId || null, note, createdAt],
  );

  return res.rows[0] || null;
}
