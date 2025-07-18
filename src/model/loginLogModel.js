import { query } from '../repository/db.js';

export async function insertLoginLog({ actorId, loginType, loginSource }) {
  await query(
    'INSERT INTO login_log (actor_id, login_type, login_source) VALUES ($1, $2, $3)',
    [actorId || '', loginType || '', loginSource || '']
  );
}

export async function getLoginLogs() {
  const { rows } = await query('SELECT * FROM login_log ORDER BY logged_at DESC');
  return rows;
}
