import { query, withTransaction } from '../repository/db.js';

function normalizeJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeNumeric(value) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export async function createRequest(payload) {
  const res = await withTransaction(
    client =>
      client.query(
        `INSERT INTO dashboard_premium_request (
          dashboard_user_id,
          user_id,
          username,
          whatsapp,
          bank_name,
          account_number,
          sender_name,
          transfer_amount,
          premium_tier,
          client_id,
          user_uuid,
          metadata,
          status,
          request_token,
          expired_at,
          responded_at,
          admin_whatsapp,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12,
          COALESCE($13, 'pending'),
          COALESCE($14, gen_random_uuid()),
          $15, $16, $17,
          COALESCE($18, NOW()),
          COALESCE($19, NOW())
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
          normalizeNumeric(payload.transferAmount),
          payload.premiumTier || null,
          payload.clientId || null,
          payload.userUuid || null,
          normalizeJson(payload.metadata),
          payload.status,
          payload.requestToken || null,
          payload.expiredAt || null,
          payload.respondedAt || null,
          payload.adminWhatsapp || null,
          payload.createdAt || null,
          payload.updatedAt || null,
        ],
      ),
    {
      sessionSettings: {
        'app.current_client_id': payload.clientId || null,
        'app.current_dashboard_user_id': payload.dashboardUserId || null,
        'app.current_user_id': payload.userId || null,
        'app.current_user_uuid': payload.userUuid || null,
      },
    },
  );

  return res.rows[0];
}

export async function findLatestPendingByUsername(username) {
  const res = await query(
    `SELECT *
     FROM dashboard_premium_request
     WHERE LOWER(username) = LOWER($1)
       AND status = 'pending'
       AND expired_at IS NULL
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

export async function findByToken(requestToken) {
  const res = await query(
    `SELECT * FROM dashboard_premium_request WHERE request_token = $1`,
    [requestToken],
  );
  return res.rows[0] || null;
}

export async function updateStatus({
  requestId,
  status,
  adminWhatsapp = null,
  respondedAt = null,
  expiredAt = null,
  updatedAt = null,
}) {
  const res = await query(
    `UPDATE dashboard_premium_request
     SET status = $2,
         responded_at = COALESCE($3, responded_at),
         expired_at = COALESCE($4, expired_at),
         admin_whatsapp = COALESCE($5, admin_whatsapp),
         updated_at = COALESCE($6, NOW())
     WHERE request_id = $1
     RETURNING *`,
    [requestId, status, respondedAt, expiredAt, adminWhatsapp, updatedAt],
  );

  return res.rows[0] || null;
}

export async function updateStatusIfPending({
  requestId,
  status,
  adminWhatsapp = null,
  respondedAt = null,
  expiredAt = null,
  updatedAt = null,
}) {
  const res = await query(
    `UPDATE dashboard_premium_request
     SET status = $2,
         responded_at = COALESCE($3, responded_at),
         expired_at = COALESCE($4, expired_at),
         admin_whatsapp = COALESCE($5, admin_whatsapp),
         updated_at = COALESCE($6, NOW())
     WHERE request_id = $1
       AND status = 'pending'
     RETURNING *`,
    [requestId, status, respondedAt, expiredAt, adminWhatsapp, updatedAt],
  );

  return res.rows[0] || null;
}

export async function findPendingOlderThanMinutes(minutes = 60) {
  const res = await query(
    `SELECT *
     FROM dashboard_premium_request
     WHERE status = 'pending'
       AND expired_at IS NULL
       AND created_at <= NOW() - ($1 * INTERVAL '1 minute')
     ORDER BY created_at ASC`,
    [minutes],
  );

  return res.rows || [];
}
