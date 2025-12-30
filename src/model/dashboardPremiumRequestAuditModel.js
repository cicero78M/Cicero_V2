import { withTransaction } from '../repository/db.js';

function normalizeSetting(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  const serialized = String(value).trim();
  return serialized || null;
}

function buildSessionSettings(sessionContext = {}) {
  const clientId = normalizeSetting(sessionContext.clientId ?? sessionContext.client_id);
  const dashboardUserId = normalizeSetting(
    sessionContext.dashboardUserId ?? sessionContext.dashboard_user_id,
  );
  const userUuid = normalizeSetting(sessionContext.userUuid ?? sessionContext.user_uuid);
  const username = normalizeSetting(sessionContext.username);

  return {
    'app.current_client_id': clientId,
    'app.current_dashboard_user_id': dashboardUserId,
    'app.current_user_uuid': userUuid,
    'app.current_username': username,
  };
}

export async function insertAuditEntry({
  requestId,
  action,
  adminWhatsapp = null,
  adminChatId = null,
  note = null,
  sessionContext = {},
} = {}) {
  if (!requestId || !action) {
    throw new Error('requestId and action are required for audit entries');
  }

  const res = await withTransaction(
    client =>
      client.query(
        `INSERT INTO dashboard_premium_request_audit (
          request_id,
          action,
          admin_whatsapp,
          admin_chat_id,
          note
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [requestId, action, adminWhatsapp, adminChatId, note],
      ),
    { sessionSettings: buildSessionSettings(sessionContext) },
  );

  return res.rows[0];
}

