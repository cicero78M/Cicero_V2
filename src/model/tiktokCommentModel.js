import { pool } from "../config/db.js";

export async function upsertTiktokComments(video_id, commentsArr) {
  // Kolom: video_id (PK), comments (jsonb), updated_at (timestamp)
  const q = `
    INSERT INTO tiktok_comment (video_id, comments, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (video_id)
    DO UPDATE SET comments = $2, updated_at = NOW()
  `;
  await pool.query(q, [video_id, JSON.stringify(commentsArr)]);
}

export async function getCommentsByVideoId(video_id) {
  const q = `SELECT comments FROM tiktok_comment WHERE video_id = $1`;
  const res = await pool.query(q, [video_id]);
  return res.rows[0] ? { comments: res.rows[0].comments } : { comments: [] };
}
