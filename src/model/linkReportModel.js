import { query } from '../repository/db.js';
import { findPostByShortcode } from './instaPostModel.js';

export async function createLinkReport(data) {
  const exists = await findPostByShortcode(data.shortcode);
  if (!exists) {
    const err = new Error('shortcode not found');
    err.statusCode = 400;
    throw err;
  }

  const res = await query(
    `INSERT INTO link_report (
        shortcode, user_id, instagram_link, facebook_link,
        twitter_link, tiktok_link, youtube_link, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8, NOW()))
     ON CONFLICT (shortcode, user_id) DO UPDATE
     SET instagram_link = EXCLUDED.instagram_link,
         facebook_link = EXCLUDED.facebook_link,
         twitter_link = EXCLUDED.twitter_link,
         tiktok_link = EXCLUDED.tiktok_link,
         youtube_link = EXCLUDED.youtube_link,
         created_at = EXCLUDED.created_at
     RETURNING *`,
    [
      data.shortcode,
      data.user_id || null,
      data.instagram_link || null,
      data.facebook_link || null,
      data.twitter_link || null,
      data.tiktok_link || null,
      data.youtube_link || null,
      data.created_at || null
    ]
  );
  return res.rows[0];
}

export async function getLinkReports() {
  const res = await query(
    `SELECT r.*, p.caption, p.image_url, p.thumbnail_url
     FROM link_report r
     LEFT JOIN insta_post p ON p.shortcode = r.shortcode
     ORDER BY r.created_at DESC`
  );
  return res.rows;
}

export async function findLinkReportByShortcode(shortcode, user_id) {
  const params = [shortcode];
  const condition = user_id ? 'AND r.user_id = $2' : '';
  if (user_id) params.push(user_id);
  const res = await query(
    `SELECT r.*, p.caption, p.image_url, p.thumbnail_url
     FROM link_report r
     LEFT JOIN insta_post p ON p.shortcode = r.shortcode
     WHERE r.shortcode = $1 ${condition}`,
    params
  );
  return res.rows[0] || null;
}

export async function updateLinkReport(shortcode, user_id, data) {
  const old = await findLinkReportByShortcode(shortcode, user_id);
  if (!old) return null;
  const merged = { ...old, ...data };
  const res = await query(
    `UPDATE link_report SET
      instagram_link=$3,
      facebook_link=$4,
      twitter_link=$5,
      tiktok_link=$6,
      youtube_link=$7,
      created_at=$8
     WHERE shortcode=$1 AND user_id=$2 RETURNING *`,
    [
      shortcode,
      user_id,
      merged.instagram_link || null,
      merged.facebook_link || null,
      merged.twitter_link || null,
      merged.tiktok_link || null,
      merged.youtube_link || null,
      merged.created_at || null
    ]
  );
  return res.rows[0];
}

export async function deleteLinkReport(shortcode, user_id) {
  const res = await query('DELETE FROM link_report WHERE shortcode=$1 AND user_id=$2 RETURNING *', [shortcode, user_id]);
  return res.rows[0] || null;
}

export async function getReportsTodayByClient(client_id) {
  const res = await query(
    `SELECT r.* FROM link_report r
     JOIN "user" u ON u.user_id = r.user_id
     WHERE u.client_id = $1 AND r.created_at::date = NOW()::date
     ORDER BY r.created_at ASC`,
    [client_id]
  );
  return res.rows;
}

export async function getReportsTodayByShortcode(client_id, shortcode) {
  const res = await query(
    `SELECT r.* FROM link_report r
     JOIN "user" u ON u.user_id = r.user_id
     WHERE u.client_id = $1 AND r.shortcode = $2
       AND r.created_at::date = NOW()::date
     ORDER BY r.created_at ASC`,
    [client_id, shortcode]
  );
  return res.rows;
}
export async function getRekapLinkByClient(
  client_id,
  periode = 'harian',
  tanggal
) {
  let dateFilterPost = 'p.created_at::date = NOW()::date';
  let dateFilterReport = 'r.created_at::date = NOW()::date';
  const params = [client_id];
  if (periode === 'semua') {
    dateFilterPost = '1=1';
    dateFilterReport = '1=1';
  } else if (periode === 'mingguan') {
    if (tanggal) {
      params.push(tanggal);
      dateFilterPost = "date_trunc('week', p.created_at) = date_trunc('week', $2::date)";
      dateFilterReport = "date_trunc('week', r.created_at) = date_trunc('week', $2::date)";
    } else {
      dateFilterPost = "date_trunc('week', p.created_at) = date_trunc('week', NOW())";
      dateFilterReport = "date_trunc('week', r.created_at) = date_trunc('week', NOW())";
    }
  } else if (periode === 'bulanan') {
    if (tanggal) {
      const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
      params.push(monthDate);
      dateFilterPost = "date_trunc('month', p.created_at) = date_trunc('month', $2::date)";
      dateFilterReport = "date_trunc('month', r.created_at) = date_trunc('month', $2::date)";
    } else {
      dateFilterPost = "date_trunc('month', p.created_at) = date_trunc('month', NOW())";
      dateFilterReport = "date_trunc('month', r.created_at) = date_trunc('month', NOW())";
    }
  } else if (tanggal) {
    params.push(tanggal);
    dateFilterPost = 'p.created_at::date = $2::date';
    dateFilterReport = 'r.created_at::date = $2::date';
  }

  const { rows: postRows } = await query(
    `SELECT COUNT(*) AS jumlah_post FROM insta_post p WHERE p.client_id = $1 AND ${dateFilterPost}`,
    params
  );
  const maxLink = parseInt(postRows[0]?.jumlah_post || '0', 10) * 5;

  const { rows } = await query(
    `WITH link_sum AS (
       SELECT r.user_id,
         SUM(
           (CASE WHEN r.instagram_link IS NOT NULL AND r.instagram_link <> '' THEN 1 ELSE 0 END) +
           (CASE WHEN r.facebook_link IS NOT NULL AND r.facebook_link <> '' THEN 1 ELSE 0 END) +
           (CASE WHEN r.twitter_link IS NOT NULL AND r.twitter_link <> '' THEN 1 ELSE 0 END) +
           (CASE WHEN r.tiktok_link IS NOT NULL AND r.tiktok_link <> '' THEN 1 ELSE 0 END) +
           (CASE WHEN r.youtube_link IS NOT NULL AND r.youtube_link <> '' THEN 1 ELSE 0 END)
         ) AS jumlah_link
       FROM link_report r
       JOIN insta_post p ON p.shortcode = r.shortcode
       WHERE p.client_id = $1 AND ${dateFilterReport}
       GROUP BY r.user_id
     )
     SELECT
       u.user_id,
       u.title,
       u.nama,
       u.insta AS username,
       u.divisi,
       u.exception,
       COALESCE(ls.jumlah_link, 0) AS jumlah_link
     FROM "user" u
     LEFT JOIN link_sum ls ON ls.user_id = u.user_id
     WHERE u.client_id = $1 AND u.status = true
     GROUP BY u.user_id, u.title, u.nama, u.insta, u.divisi, u.exception, ls.jumlah_link
     ORDER BY jumlah_link DESC, u.nama ASC`,
    params
  );

  for (const user of rows) {
    if (
      user.exception === true ||
      user.exception === 'true' ||
      user.exception == 1 ||
      user.exception === '1'
    ) {
      user.jumlah_link = maxLink;
    } else {
      user.jumlah_link = parseInt(user.jumlah_link, 10) || 0;
    }
    user.display_nama = user.title ? `${user.title} ${user.nama}` : user.nama;
  }

  return rows;
}

export async function getReportsThisMonthByClient(client_id) {
  const { rows } = await query(
    `SELECT
       r.created_at::date AS date,
       TRIM(CONCAT(u.title, ' ', u.nama)) AS pangkat_nama,
       u.user_id AS nrp,
       u.divisi AS satfung,
       r.instagram_link AS instagram,
       r.facebook_link AS facebook,
       r.twitter_link AS twitter,
       r.tiktok_link AS tiktok,
       r.youtube_link AS youtube
     FROM link_report r
     JOIN insta_post p ON p.shortcode = r.shortcode
     JOIN "user" u ON u.user_id = r.user_id
     WHERE p.client_id = $1
       AND date_trunc('month', r.created_at) = date_trunc('month', NOW())
     ORDER BY r.created_at ASC`,
    [client_id]
  );
  return rows;
}
