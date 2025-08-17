import { query } from '../repository/db.js';

export async function findByUsername(username) {
  const res = await query(
    'SELECT * FROM dashboard_user WHERE username = $1',
    [username]
  );
  return res.rows[0] || null;
}

export async function findByWhatsApp(wa) {
  const res = await query(
    'SELECT * FROM dashboard_user WHERE whatsapp = $1',
    [wa]
  );
  return res.rows[0] || null;
}

export async function createUser(data) {
  const res = await query(
    `INSERT INTO dashboard_user (dashboard_user_id, username, password_hash, role, status, client_id, user_id, whatsapp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.dashboard_user_id,
      data.username,
      data.password_hash,
      data.role,
      data.status,
      data.client_id,
      data.user_id ?? null,
      data.whatsapp,
    ]
  );
  return res.rows[0];
}

export async function findById(id) {
  const res = await query('SELECT * FROM dashboard_user WHERE dashboard_user_id=$1', [id]);
  return res.rows[0] || null;
}

export async function updateStatus(id, status) {
  const res = await query(
    'UPDATE dashboard_user SET status=$2, updated_at=NOW() WHERE dashboard_user_id=$1 RETURNING *',
    [id, status]
  );
  return res.rows[0];
}
