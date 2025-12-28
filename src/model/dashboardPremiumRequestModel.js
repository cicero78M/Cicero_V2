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

export async function findById(requestId) {
  const res = await query(
    `SELECT * FROM dashboard_premium_request WHERE request_id = $1`,
    [requestId],
  );
  return res.rows[0] || null;
}
