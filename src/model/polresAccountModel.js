import { query } from '../repository/db.js';

export async function upsertPolresAccount({ username, last_post_at = null }) {
  if (!username) return;
  await query(
    `INSERT INTO polres_insta (username, last_post_at, checked_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (username) DO UPDATE
       SET last_post_at = EXCLUDED.last_post_at,
           checked_at = NOW()`,
    [username, last_post_at]
  );
}

export async function findAll() {
  const res = await query('SELECT * FROM polres_insta ORDER BY username');
  return res.rows;
}
