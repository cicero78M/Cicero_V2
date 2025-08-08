// src/model/tiktokPostModel.js
import { query } from '../repository/db.js';

/**
 * Simpan/update satu atau banyak post TikTok (array of objects)
 * @param {string} client_id
 * @param {Array} posts
 */
export async function upsertTiktokPosts(client_id, posts) {
  if (!Array.isArray(posts)) return;
  for (const post of posts) {
    await query(
      `INSERT INTO tiktok_post (client_id, video_id, caption, like_count, comment_count, created_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
       ON CONFLICT (video_id) DO UPDATE
         SET client_id = EXCLUDED.client_id,
             caption = EXCLUDED.caption,
             like_count = EXCLUDED.like_count,
             comment_count = EXCLUDED.comment_count,
             created_at = EXCLUDED.created_at`,
      [
        client_id,
        post.video_id || post.id,
        post.desc || post.caption || "",
        post.digg_count ?? post.like_count ?? 0,
        post.comment_count ?? 0,
        post.created_at || post.create_time || post.createTime || null,
      ]
    );
  }
}

/**
 * Ambil semua TikTok video_id untuk client di hari ini
 * @param {string} client_id
 * @returns {Array} Array of video_id
 */
export async function getVideoIdsTodayByClient(client_id) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const res = await query(
    `SELECT video_id FROM tiktok_post
     WHERE client_id = $1 AND DATE(created_at) = $2`,
    [client_id, `${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map(r => r.video_id);
}

/**
 * Ambil semua TikTok post (row) hari ini berdasarkan client_id
 * @param {string} client_id
 * @returns {Array} Array of post object
 */
export async function getPostsTodayByClient(client_id) {
  const res = await query(
    `SELECT * FROM tiktok_post WHERE client_id = $1 AND created_at::date = NOW()::date`,
    [client_id]
  );
  return res.rows;
}

/**
 * Ambil semua TikTok post (row) untuk client tanpa filter hari
 * @param {string} client_id
 * @returns {Array} Array of post object
 */
export async function getPostsByClientId(client_id) {
  const res = await query(
    `SELECT * FROM tiktok_post WHERE client_id = $1 ORDER BY created_at DESC`,
    [client_id]
  );
  return res.rows;
}

export const findByClientId = getPostsByClientId;

export async function countPostsByClient(client_id, periode = 'harian', tanggal, start_date, end_date) {
  let dateFilter = "created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  const params = [client_id];
  if (start_date && end_date) {
    params.push(start_date, end_date);
    dateFilter = 'created_at::date BETWEEN $2::date AND $3::date';
  } else if (periode === 'semua') {
    dateFilter = '1=1';
  } else if (periode === 'mingguan') {
    if (tanggal) {
      params.push(tanggal);
      dateFilter = "date_trunc('week', created_at) = date_trunc('week', $2::date)";
    } else {
      dateFilter = "date_trunc('week', created_at) = date_trunc('week', NOW())";
    }
  } else if (periode === 'bulanan') {
    if (tanggal) {
      const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
      params.push(monthDate);
      dateFilter = "date_trunc('month', created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $2::date)";
    } else {
      dateFilter = "date_trunc('month', created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
    }
  } else if (tanggal) {
    params.push(tanggal);
    dateFilter = 'created_at::date = $2::date';
  }

  const { rows } = await query(
    `SELECT COUNT(*) AS jumlah_post FROM tiktok_post WHERE client_id = $1 AND ${dateFilter}`,
    params
  );
  return parseInt(rows[0]?.jumlah_post || '0', 10);
}
