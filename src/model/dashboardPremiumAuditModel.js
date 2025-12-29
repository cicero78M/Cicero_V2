import { query } from '../repository/db.js';

function normalizeNullableUuid(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return value;
}

export async function insertAuditEntry({
  requestId,
  dashboardUserId = null,
  action,
  actor,
  reason = null,
  statusFrom = null,
  statusTo = null,
  adminWhatsapp = null,
  createdAt = null,
  updatedAt = null,
}) {
  const normalizedDashboardUserId = normalizeNullableUuid(dashboardUserId);

  const res = await query(
    `INSERT INTO dashboard_premium_audit (
      request_id,
      dashboard_user_id,
      action,
      actor,
      reason,
      status_from,
      status_to,
      admin_whatsapp,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      COALESCE($9, NOW()),
      COALESCE($10, NOW())
    )
    RETURNING *`,
    [
      requestId,
      normalizedDashboardUserId,
      action,
      actor,
      reason,
      statusFrom,
      statusTo,
      adminWhatsapp,
      createdAt,
      updatedAt,
    ],
  );

  return res.rows[0] || null;
}

export async function findByRequestId(requestId) {
  const res = await query(
    `SELECT * FROM dashboard_premium_audit
     WHERE request_id = $1
     ORDER BY created_at ASC, audit_id ASC`,
    [requestId],
  );

  return res.rows || [];
}

export async function updateAuditReason(auditId, reason) {
  const res = await query(
    `UPDATE dashboard_premium_audit
     SET reason = $2,
         updated_at = NOW()
     WHERE audit_id = $1
     RETURNING *`,
    [auditId, reason],
  );

  return res.rows[0] || null;
}
