import { pool } from '../config/db.js';

export async function upsertTiktokPost(data) {
  const { client_id, video_id, caption, created_at, like_count, comment_count } = data;
  await pool.query(
    `INSERT INTO tiktok_post (client_id, video_id, caption, created_at, like_count, comment_count)
     VALUES ($1, $2, $3, to_timestamp($4), $5, $6)
     ON CONFLICT (video_id) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       caption = EXCLUDED.caption,
       created_at = to_timestamp($4),
       like_count = EXCLUDED.like_count,
       comment_count = EXCLUDED.comment_count`,
    [client_id, video_id, caption, created_at, like_count, comment_count]
  );
}

export async function getShortcodesTodayByClient(client_id) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const res = await pool.query(
    `SELECT video_id FROM tiktok_post WHERE client_id = $1 AND DATE(created_at) = $2`,
    [client_id, `${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map(r => r.video_id);
}
