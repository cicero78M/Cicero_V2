// src/model/instaPostModel.js
import { query } from '../repository/db.js';

export async function upsertInstaPost(data) {
  // Pastikan field yang dipakai sesuai dengan kolom di DB
  const {
    client_id,
    shortcode,
    caption = null,
    comment_count = 0,
    thumbnail_url = null,
    is_video = false,
    video_url = null,
    image_url = null,
    images_url = null,
    is_carousel = false,
  } = data;

  // created_at bisa dihandle via taken_at di service (lihat service)
  await query(
    `INSERT INTO insta_post (client_id, shortcode, caption, comment_count, thumbnail_url, is_video, video_url, image_url, images_url, is_carousel, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11, NOW()))
     ON CONFLICT (shortcode) DO UPDATE
      SET client_id = EXCLUDED.client_id,
          caption = EXCLUDED.caption,
          comment_count = EXCLUDED.comment_count,
          thumbnail_url = EXCLUDED.thumbnail_url,
          is_video = EXCLUDED.is_video,
          video_url = EXCLUDED.video_url,
          image_url = EXCLUDED.image_url,
          images_url = EXCLUDED.images_url,
          is_carousel = EXCLUDED.is_carousel,
          created_at = EXCLUDED.created_at`,
    [client_id, shortcode, caption, comment_count, thumbnail_url, is_video, video_url, image_url, JSON.stringify(images_url), is_carousel, data.created_at || null]
  );
}

export async function findPostByShortcode(shortcode) {
  const res = await query('SELECT * FROM insta_post WHERE shortcode = $1', [shortcode]);
  return res.rows[0] || null;
}

export async function getShortcodesTodayByClient(identifier) {
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta'
  });

  const typeRes = await query(
    'SELECT client_type FROM clients WHERE LOWER(client_id) = LOWER($1)',
    [identifier]
  );

  const isDitbinmas = identifier.toLowerCase() === 'ditbinmas';
  const clientType = typeRes.rows[0]?.client_type?.toLowerCase();

  let sql;
  let params;

  if (
    typeRes.rows.length === 0 ||
    (clientType === 'direktorat' && !isDitbinmas)
  ) {
    sql =
      `SELECT p.shortcode FROM insta_post p\n` +
      `JOIN insta_post_roles pr ON pr.shortcode = p.shortcode\n` +
      `WHERE LOWER(pr.role_name) = LOWER($1)\n` +
      `  AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date`;
    params = [identifier, today];
  } else {
    sql =
      `SELECT shortcode FROM insta_post\n` +
      `WHERE LOWER(client_id) = LOWER($1) AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date`;
    params = [identifier, today];
  }

  const res = await query(sql, params);
  return res.rows.map((r) => r.shortcode);
}

export async function getShortcodesTodayByUsername(username) {
  if (!username) return [];
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const res = await query(
    `SELECT p.shortcode FROM insta_post p JOIN clients c ON c.client_id = p.client_id
     WHERE c.client_insta = $1 AND DATE(p.created_at) = $2`,
    [username, `${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map(r => r.shortcode);
}


export async function getPostsTodayByClient(client_id) {
  const res = await query(
    `SELECT * FROM insta_post WHERE client_id = $1 AND created_at::date = NOW()::date`,
    [client_id]
  );
  return res.rows;
}

export async function getPostsByClientId(clientId) {
  const res = await query(
    `SELECT DISTINCT ON (shortcode) *
     FROM insta_post
     WHERE client_id = $1
     ORDER BY shortcode, created_at DESC`,
    [clientId]
  );
  return res.rows;
}

export async function findByClientId(clientId) {
  return getPostsByClientId(clientId);
}

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
    `SELECT COUNT(*) AS jumlah_post FROM insta_post WHERE client_id = $1 AND ${dateFilter}`,
    params
  );
  return parseInt(rows[0]?.jumlah_post || '0', 10);
}
