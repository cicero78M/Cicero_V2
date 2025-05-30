// src/model/tiktokPostModel.js
import { pool } from '../config/db.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

// UPSERT satu postingan TikTok
export async function upsertTiktokPost(postData) {
  // Patch: konversi postData.created_at ke Date ISO jika masih UNIX detik (number)
  let createdAtVal = postData.created_at;
  if (typeof createdAtVal === 'number') {
    createdAtVal = new Date(createdAtVal * 1000); // UNIX detik -> ms
  }
  if (createdAtVal instanceof Date) {
    createdAtVal = createdAtVal.toISOString();
  }
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
      createdAtVal,    // sudah ISO string
      postData.like_count,
      postData.comment_count
    ]
  );
}

// GET semua postingan TikTok yang di-post "hari ini" (Asia/Jakarta, debug mode)
export async function getPostsTodayByClient(client_id) {
  const startOfToday = dayjs().tz('Asia/Jakarta').startOf('day').utc().format();
  const endOfToday = dayjs().tz('Asia/Jakarta').endOf('day').utc().format();

  // DEBUG: log batas waktu hari ini
  console.log('[DEBUG][getPostsTodayByClient] client_id:', client_id);
  console.log('[DEBUG] startOfToday (WIB->UTC):', startOfToday);
  console.log('[DEBUG] endOfToday (WIB->UTC):', endOfToday);

  // DEBUG: tampilkan seluruh posting TikTok client_id tersebut
  const allPosts = await pool.query(
    `SELECT video_id, created_at FROM tiktok_post WHERE client_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [client_id]
  );
  console.log('[DEBUG] Semua post TikTok client ini:');
  allPosts.rows.forEach(row => {
    console.log(`  - video_id: ${row.video_id} | created_at: ${row.created_at}`);
  });

  const res = await pool.query(
    `SELECT video_id, created_at FROM tiktok_post
     WHERE client_id = $1 AND created_at >= $2 AND created_at <= $3`,
    [client_id, startOfToday, endOfToday]
  );
  console.log('[DEBUG] Post yang lolos filter hari ini:', res.rows);

  return res.rows.map(row => row.video_id);
}
