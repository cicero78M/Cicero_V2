import { pool } from '../config/db.js';
export async function upsertTiktokPost(postData) {
  await pool.query(
    `INSERT INTO tiktok_post (id, client_id, caption, created_at, comment_count, url)
     VALUES ($1, $2, $3, to_timestamp($4), $5, $6)
     ON CONFLICT (id) DO UPDATE
     SET caption = EXCLUDED.caption,
         comment_count = EXCLUDED.comment_count,
         created_at = EXCLUDED.created_at,
         url = EXCLUDED.url`,
    [
      postData.id,
      postData.client_id,
      postData.caption,
      postData.created_at,
      postData.comment_count,
      postData.url
    ]
  );
}
