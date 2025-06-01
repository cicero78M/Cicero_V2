import { pool } from '../config/db.js';

// PATCH FINAL: Simpan/update post TikTok hari ini (KONVENSI SESUAI DB)
export async function upsertTiktokPosts(client_id, posts) {
  if (!Array.isArray(posts)) return;
  for (const post of posts) {
    await pool.query(
      `INSERT INTO tiktok_post (
        video_id, client_id, caption, created_at, like_count, comment_count
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (video_id) DO UPDATE SET
        caption = EXCLUDED.caption,
        created_at = EXCLUDED.created_at,
        like_count = EXCLUDED.like_count,
        comment_count = EXCLUDED.comment_count`,
      [
        post.video_id,
        client_id,
        post.caption ?? "",  // Ambil dari field 'caption' saja (bukan desc)
        post.created_at,     // Sudah berupa Date, JS akan auto konversi ke timestamp PG
        post.like_count ?? 0,
        post.comment_count ?? 0
      ]
    );
  }
}

// PATCH FINAL: SELECT konten hari ini
export async function getPostsTodayByClient(client_id) {
  const res = await pool.query(
    `SELECT * FROM tiktok_post WHERE client_id = $1 AND created_at::date = CURRENT_DATE`,
    [client_id]
  );
  return res.rows;
}
