// src/model/tiktokPostModel.js

import { pool } from '../config/db.js';

// Simpan/update post TikTok hari ini
export async function upsertTiktokPosts(client_id, posts) {
  if (!Array.isArray(posts)) return;
  for (const post of posts) {
    await pool.query(
      `INSERT INTO tiktok_post (client_id, video_id, caption, created_at, like_count, comment_count)
      VALUES ($1, $2, $3, to_timestamp($4), $5, $6)
      ON CONFLICT (video_id) DO UPDATE SET
        caption = EXCLUDED.caption,
        created_at = EXCLUDED.created_at,
        like_count = EXCLUDED.like_count,
        comment_count = EXCLUDED.comment_count`,
      [
        client_id,
        post.video_id,
        post.caption || "",
        post.created_at, // unix timestamp, detik
        post.like_count || 0,
        post.comment_count || 0,
      ]
    );
  }
}

export async function getPostsTodayByClient(client_id) {
  const res = await pool.query(
    `SELECT * FROM tiktok_post WHERE client_id = $1 AND created_at::date = CURRENT_DATE`,
    [client_id]
  );
  return res.rows;
}
