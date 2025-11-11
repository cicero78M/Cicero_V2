// src/model/tiktokPostModel.js
import { query } from '../repository/db.js';

function normalizeClientId(id) {
  return typeof id === "string" ? id.trim().toLowerCase() : id;
}

/**
 * Ambil satu post TikTok berdasarkan video_id.
 * @param {string} video_id
 * @returns {Promise<object|null>}
 */
export async function findPostByVideoId(video_id) {
  const normalizedVideoId = (video_id || "").trim();
  if (!normalizedVideoId) {
    return null;
  }
  const { rows } = await query(
    `SELECT * FROM tiktok_post WHERE video_id = $1 LIMIT 1`,
    [normalizedVideoId]
  );
  return rows[0] || null;
}

/**
 * Hapus post TikTok berdasarkan video_id.
 * Mengembalikan jumlah baris yang dihapus.
 * @param {string} video_id
 * @returns {Promise<number>}
 */
export async function deletePostByVideoId(video_id) {
  const normalizedVideoId = (video_id || "").trim();
  if (!normalizedVideoId) {
    return 0;
  }
  const res = await query(
    `DELETE FROM tiktok_post WHERE video_id = $1`,
    [normalizedVideoId]
  );
  return res.rowCount || 0;
}

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
  const normalizedId = normalizeClientId(client_id);
  const res = await query(
    `SELECT video_id FROM tiktok_post
     WHERE LOWER(TRIM(client_id)) = $1 AND DATE(created_at) = $2`,
    [normalizedId, `${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map((r) => r.video_id);
}

/**
 * Ambil semua TikTok post (row) hari ini berdasarkan client_id
 * @param {string} client_id
 * @returns {Array} Array of post object
 */
export async function getPostsTodayByClient(client_id) {
  const normalizedId = normalizeClientId(client_id);
  const res = await query(
    `SELECT * FROM tiktok_post WHERE LOWER(TRIM(client_id)) = $1 AND created_at::date = NOW()::date ORDER BY created_at ASC, video_id ASC`,
    [normalizedId]
  );
  return res.rows;
}

/**
 * Ambil semua TikTok post (row) untuk client tanpa filter hari
 * @param {string} client_id
 * @returns {Array} Array of post object
 */
export async function getPostsByClientId(client_id) {
  const normalizedId = normalizeClientId(client_id);
  const res = await query(
    `SELECT * FROM tiktok_post WHERE LOWER(TRIM(client_id)) = $1 ORDER BY created_at DESC`,
    [normalizedId]
  );
  return res.rows;
}

export const findByClientId = getPostsByClientId;

export async function getPostsByClientAndDateRange(client_id, startDate, endDate) {
  if (!client_id) return [];
  if (!startDate || !endDate) return [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }

  const [startBound, endBound] =
    start <= end ? [start, end] : [end, start];

  const startStr = startBound.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta'
  });
  const endStr = endBound.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta'
  });

  const normalizedId = normalizeClientId(client_id);
  const res = await query(
    `SELECT * FROM tiktok_post
     WHERE LOWER(TRIM(client_id)) = $1
       AND (created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date
     ORDER BY created_at DESC`,
    [normalizedId, startStr, endStr]
  );
  return res.rows;
}

export async function countPostsByClient(
  client_id,
  periode = 'harian',
  tanggal,
  start_date,
  end_date,
  role
) {
  const normalizedId = normalizeClientId(client_id);
  let clientType = null;
  if (normalizedId) {
    const clientTypeRes = await query(
      `SELECT client_type FROM clients WHERE LOWER(TRIM(client_id)) = $1 LIMIT 1`,
      [normalizedId]
    );
    clientType = clientTypeRes.rows[0]?.client_type?.toLowerCase() || null;
  }

  const params = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  const whereClauses = [];
  if (clientType !== 'direktorat' && normalizedId) {
    const idx = addParam(normalizedId);
    whereClauses.push(`LOWER(TRIM(p.client_id)) = ${idx}`);
  } else if (clientType === 'direktorat') {
    const effectiveRole = normalizeClientId(role) || normalizedId;
    if (effectiveRole) {
      const roleIdx = addParam(effectiveRole);
      whereClauses.push(`EXISTS (
        SELECT 1
        FROM "user" u
        JOIN user_roles ur ON ur.user_id = u.user_id
        JOIN roles r ON r.role_id = ur.role_id
        WHERE LOWER(TRIM(u.client_id)) = LOWER(TRIM(p.client_id))
          AND LOWER(TRIM(r.role_name)) = ${roleIdx}
      )`);
    }
  }

  let dateFilter = "p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  if (start_date && end_date) {
    const startIdx = addParam(start_date);
    const endIdx = addParam(end_date);
    dateFilter = `p.created_at::date BETWEEN ${startIdx}::date AND ${endIdx}::date`;
  } else if (periode === 'semua') {
    dateFilter = '1=1';
  } else if (periode === 'mingguan') {
    if (tanggal) {
      const tanggalIdx = addParam(tanggal);
      dateFilter = `date_trunc('week', p.created_at) = date_trunc('week', ${tanggalIdx}::date)`;
    } else {
      dateFilter = "date_trunc('week', p.created_at) = date_trunc('week', NOW())";
    }
  } else if (periode === 'bulanan') {
    if (tanggal) {
      const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
      const monthIdx = addParam(monthDate);
      dateFilter = `date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', ${monthIdx}::date)`;
    } else {
      dateFilter = "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
    }
  } else if (tanggal) {
    const tanggalIdx = addParam(tanggal);
    dateFilter = `p.created_at::date = ${tanggalIdx}::date`;
  }

  if (dateFilter) {
    whereClauses.push(dateFilter);
  }

  const whereSql = whereClauses.length ? whereClauses.join(' AND ') : '1=1';

  const { rows } = await query(
    `SELECT COUNT(DISTINCT p.video_id) AS jumlah_post FROM tiktok_post p WHERE ${whereSql}`,
    params
  );
  return parseInt(rows[0]?.jumlah_post || '0', 10);
}
