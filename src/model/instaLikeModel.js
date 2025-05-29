// src/model/instaLikeModel.js
import { pool } from '../config/db.js';

export async function upsertInstaLike(shortcode, likes) {
  const result = await pool.query(
    `INSERT INTO insta_like (shortcode, likes, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (shortcode) DO UPDATE
     SET likes = EXCLUDED.likes, updated_at = NOW()`,
    [shortcode, JSON.stringify(likes)]
  );
  return result.rowCount;
}
