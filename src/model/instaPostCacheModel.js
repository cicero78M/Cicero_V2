import { pool } from '../config/db.js';

export async function insertCache(username, posts) {
  if (!username) return;
  await pool.query(
    `INSERT INTO insta_post_cache (username, posts, fetched_at)
     VALUES ($1, $2, NOW())`,
    [username, JSON.stringify(posts)]
  );
}

export async function getLatestCache(username) {
  const res = await pool.query(
    `SELECT posts, fetched_at FROM insta_post_cache
     WHERE username = $1
     ORDER BY fetched_at DESC LIMIT 1`,
    [username]
  );
  return res.rows[0] || null;
}
