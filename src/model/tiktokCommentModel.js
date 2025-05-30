import { pool } from '../config/db.js';
export async function upsertTiktokComments(postId, comments) {
  await pool.query(
    `INSERT INTO tiktok_comment (post_id, comments, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (post_id) DO UPDATE
     SET comments = EXCLUDED.comments, updated_at = NOW()`,
    [postId, JSON.stringify(comments)]
  );
}


export async function getCommentsByVideoId(video_id) {
  const res = await pool.query(
    `SELECT comments FROM tiktok_comment WHERE video_id = $1`,
    [video_id]
  );
  if (!res.rowCount) return [];
  const comments = res.rows[0].comments;
  // Jika field adalah array username (string)
  if (Array.isArray(comments) && typeof comments[0] === 'string') return comments;
  // Jika field array of objek { unique_id: ... }
  if (Array.isArray(comments) && typeof comments[0] === 'object') {
    return comments.map(c => c.unique_id).filter(Boolean);
  }
  return [];
}
