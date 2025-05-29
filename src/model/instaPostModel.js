// src/model/instaPostModel.js
import { pool } from '../config/db.js';

// Contoh: model/instaPostModel.js
export async function upsertInstaPost(post) {
  const { shortcode, client_id, caption, like_count, ...rest } = post;
  const result = await pool.query(
    `INSERT INTO insta_post (shortcode, client_id, caption, like_count, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (shortcode) DO UPDATE
     SET caption = EXCLUDED.caption, like_count = EXCLUDED.like_count`,
    [shortcode, client_id, caption, like_count]
  );
  return result.rowCount;
}
