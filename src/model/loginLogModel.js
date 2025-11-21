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

export async function getWebLoginCountsByActor({ startTime, endTime } = {}) {
  const params = ['web'];
  const conditions = ['login_source = $1'];
  let paramIndex = params.length + 1;

  if (startTime) {
    conditions.push(`logged_at >= $${paramIndex++}`);
    params.push(startTime);
  }

  if (endTime) {
    conditions.push(`logged_at <= $${paramIndex++}`);
    params.push(endTime);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT actor_id, COUNT(*) AS login_count, MIN(logged_at) AS first_login, MAX(logged_at) AS last_login
     FROM login_log
     ${whereClause}
     GROUP BY actor_id
     ORDER BY actor_id`,
    params
  );

  return rows.map((row) => ({
    actor_id: row.actor_id,
    login_count: Number(row.login_count) || 0,
    first_login: row.first_login ? new Date(row.first_login) : null,
    last_login: row.last_login ? new Date(row.last_login) : null,
  }));
}
