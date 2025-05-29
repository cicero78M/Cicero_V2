import { pool } from '../config/db.js';

export async function upsertTiktokComment(video_id, comments) {
  await pool.query(
    `INSERT INTO tiktok_comment (video_id, comments, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (video_id) DO UPDATE
     SET comments = EXCLUDED.comments, updated_at = NOW()`,
    [video_id, JSON.stringify(comments)]
  );
}

export async function getCommentsByVideoId(video_id) {
  const res = await pool.query(
    `SELECT comments FROM tiktok_comment WHERE video_id = $1`, [video_id]
  );
  if (res.rows.length === 0) return [];
  try {
    return Array.isArray(res.rows[0].comments)
      ? res.rows[0].comments
      : JSON.parse(res.rows[0].comments);
  } catch { return []; }
}
