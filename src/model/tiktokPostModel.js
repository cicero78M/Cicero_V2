// src/model/tiktokPostModel.js
import { pool } from '../config/db.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

// UPSERT satu postingan TikTok
export async function upsertTiktokPost(postData) {
  await pool.query(
    `INSERT INTO tiktok_post (video_id, client_id, caption, created_at, like_count, comment_count)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (video_id) DO UPDATE
     SET caption = EXCLUDED.caption,
         like_count = EXCLUDED.like_count,
         comment_count = EXCLUDED.comment_count,
         created_at = EXCLUDED.created_at`,
    [
      postData.video_id,
      postData.client_id,
      postData.caption,
      postData.created_at,     // pastikan JS Date, atau string ISO (eg: 2024-05-29T08:00:00Z)
      postData.like_count,
      postData.comment_count
    ]
  );
}


export async function getPostsTodayByClient(client_id) {
  const startOfToday = dayjs().tz('Asia/Jakarta').startOf('day').utc().format();
  const endOfToday = dayjs().tz('Asia/Jakarta').endOf('day').utc().format();

  const res = await pool.query(
    `SELECT video_id FROM tiktok_post
     WHERE client_id = $1 AND created_at >= $2 AND created_at <= $3`,
    [client_id, startOfToday, endOfToday]
  );
  return res.rows.map(row => row.video_id);
}
