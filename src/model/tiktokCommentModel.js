import { pool } from '../config/db.js';

// Upsert komentar TikTok
export async function upsertTiktokComments(video_id, commenters) {
  if (!video_id || !Array.isArray(commenters)) return;
  await pool.query('DELETE FROM tiktok_comment WHERE video_id = $1', [video_id]);
  for (const username of commenters) {
    await pool.query(
      `INSERT INTO tiktok_comment (video_id, username) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [video_id, username]
    );
  }
}

export async function getCommentsByVideoId(video_id) {
  const res = await pool.query(
    `SELECT username FROM tiktok_comment WHERE video_id = $1`,
    [video_id]
  );
  return res.rows.map(r => r.username);
}
