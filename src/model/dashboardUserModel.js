import { query } from '../repository/db.js';

async function findOneBy(field, value) {
  const res = await query(
    `SELECT du.*, r.role_name AS role, COALESCE(array_agg(duc.client_id) FILTER (WHERE duc.client_id IS NOT NULL), '{}') AS client_ids
     FROM dashboard_user du
     LEFT JOIN roles r ON du.role_id = r.role_id
     LEFT JOIN dashboard_user_clients duc ON du.dashboard_user_id = duc.dashboard_user_id
     WHERE du.${field} = $1
     GROUP BY du.dashboard_user_id, r.role_name`,
    [value]
  );
  return res.rows[0] || null;
}

export async function findByUsername(username) {
  return findOneBy('username', username);
}

export async function findByWhatsApp(wa) {
  return findOneBy('whatsapp', wa);
}

export async function createUser(data) {
  const res = await query(
    `INSERT INTO dashboard_user (dashboard_user_id, username, password_hash, role_id, status, user_id, whatsapp)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.dashboard_user_id,
      data.username,
      data.password_hash,
      data.role_id,
      data.status,
      data.user_id ?? null,
      data.whatsapp,
    ]
  );
  return res.rows[0];
}

export async function addClients(dashboardUserId, clientIds = []) {
  if (!clientIds || clientIds.length === 0) {
    throw new Error('client_ids cannot be empty');
  }
  const placeholders = clientIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  await query(
    `INSERT INTO dashboard_user_clients (dashboard_user_id, client_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    [dashboardUserId, ...clientIds]
  );
}

export async function findById(id) {
  return findOneBy('dashboard_user_id', id);
}

export async function updateStatus(id, status) {
  const res = await query(
    'UPDATE dashboard_user SET status=$2, updated_at=NOW() WHERE dashboard_user_id=$1 RETURNING *',
    [id, status]
  );
  return res.rows[0];
}
