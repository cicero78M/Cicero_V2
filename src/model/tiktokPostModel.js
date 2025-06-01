import { pool } from '../config/db.js';

// Simpan/update post TikTok hari ini
export async function upsertTiktokPosts(client_id, posts) {
  if (!Array.isArray(posts)) return;
  for (const post of posts) {
    await pool.query(
      `INSERT INTO tiktok_post (client_id, video_id, "desc", create_time, digg_count, comment_count)
      VALUES ($1, $2, $3, to_timestamp($4), $5, $6)
      ON CONFLICT (video_id) DO UPDATE SET
        "desc" = EXCLUDED."desc",
        create_time = EXCLUDED.create_time,
        digg_count = EXCLUDED.digg_count,
        comment_count = EXCLUDED.comment_count`,
      [
        client_id,
        post.video_id,
        post.desc || "",
        post.create_time, // unix detik!
        post.digg_count || 0,
        post.comment_count || 0,
      ]
    );
  }
}
