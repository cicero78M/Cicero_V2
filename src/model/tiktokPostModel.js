import { pool } from '../config/db.js';

// Simpan/update post TikTok hari ini
export async function upsertTiktokPosts(client_id, posts) {
  if (!Array.isArray(posts)) return;
  for (const post of posts) {
    // PATCH: Gunakan mapping dari file TikTok API, fallback stats/diggCount, dsb
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
        post.id || post.video_id,                           // video_id
        post.desc || post.caption || "",                    // desc
        post.createTime || post.create_time,                // create_time (dalam second UNIX)
        (post.stats?.diggCount ?? post.digg_count ?? 0),    // digg_count (like)
        (post.stats?.commentCount ?? post.comment_count ?? 0), // comment_count
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
