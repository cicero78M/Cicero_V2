import { query } from '../repository/db.js';

export async function findByUsername(username) {
  const res = await query(
    'SELECT * FROM dashboard_user WHERE username = $1',
    [username]
  );
  return res.rows[0] || null;
}

export async function createUser(data) {
  const res = await query(
    `INSERT INTO dashboard_user (user_id, username, password_hash, role, status, client_id, whatsapp)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.user_id,
      data.username,
      data.password_hash,
      data.role,
      data.status,
      data.client_id,
      data.whatsapp,
    ]
  );
  return res.rows[0];
}

export async function findById(id) {
  const res = await query('SELECT * FROM dashboard_user WHERE user_id=$1', [id]);
  return res.rows[0] || null;
}

export async function updateStatus(id, status) {
  const res = await query(
    'UPDATE dashboard_user SET status=$2, updated_at=NOW() WHERE user_id=$1 RETURNING *',
    [id, status]

  );
  return res.rows[0];
}

