// src/model/instaPostModel.js
import { pool } from '../config/db.js';

export async function upsertInstaPost(data) {
  // Pastikan field yang dipakai sesuai dengan kolom di DB
  const {
    client_id,
    shortcode,
    caption = null,
    comment_count = 0, // <-- PATCH BARU
  } = data;

  // created_at bisa dihandle via taken_at di service (lihat service)
  await pool.query(
    `INSERT INTO insta_post (client_id, shortcode, caption, comment_count, created_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
     ON CONFLICT (shortcode) DO UPDATE
     SET client_id = EXCLUDED.client_id,
         caption = EXCLUDED.caption,
         comment_count = EXCLUDED.comment_count,
         created_at = EXCLUDED.created_at`,
    [client_id, shortcode, caption, comment_count, data.created_at || null]
  );
}
