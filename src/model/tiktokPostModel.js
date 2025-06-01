import { pool } from '../config/db.js';

// Simpan/update post TikTok hari ini
export async function upsertTiktokPosts(client_id, posts) {
  if (!Array.isArray(posts)) return;
  for (const post of posts) {
    await pool.query(
      `INSERT INTO tiktok_post (client_id, video_id, desc, create_time, digg_count, comment_count)
      VALUES ($1, $2, $3, to_timestamp($4), $5, $6)
      ON CONFLICT (video_id) DO UPDATE SET
        desc = EXCLUDED.desc,
        create_time = EXCLUDED.create_time,
        digg_count = EXCLUDED.digg_count,
        comment_count = EXCLUDED.comment_count`,
      [
        client_id,
        post.video_id || post.id,
        post.desc || "",
        post.create_time || post.createTime,
        post.digg_count || post.statistics?.diggCount || 0,
        post.comment_count || post.statistics?.commentCount || 0,
      ]
    );
  }
}

export async function getPostsTodayByClient(client_id) {
  const res = await pool.query(
    `SELECT * FROM tiktok_post WHERE client_id = $1 AND create_time::date = CURRENT_DATE`,
    [client_id]
  );
  return res.rows;
}
