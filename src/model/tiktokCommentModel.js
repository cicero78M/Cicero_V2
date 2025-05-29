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
