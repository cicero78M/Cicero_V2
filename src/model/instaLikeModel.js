// src/model/instaLikeModel.js
import { query } from '../repository/db.js';

/**
 * Upsert (insert/update) daftar username likes untuk sebuah shortcode.
 * Disarankan kolom likes bertipe JSONB.
 */
export async function upsertInstaLike(shortcode, likes) {
  const result = await query(
    `INSERT INTO insta_like (shortcode, likes, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (shortcode) DO UPDATE
     SET likes = EXCLUDED.likes, updated_at = NOW()`,
    [shortcode, JSON.stringify(likes)]
  );
  return result.rowCount;
}

/**
 * Mendapatkan array username likes dari database untuk 1 shortcode.
 * Otomatis handle jika likes berupa jsonb atau text (akan di-parse).
 * Return: array of username (jika belum ada, array kosong)
 */
export async function getLikeUsernamesByShortcode(shortcode) {
  const res = await query('SELECT likes FROM insta_like WHERE shortcode = $1', [shortcode]);
  if (res.rows.length === 0) return [];
  const rawLikes = res.rows[0].likes;
  if (!rawLikes) return [];

  // pastikan selalu array terlebih dahulu
  let likesArr = rawLikes;
  if (typeof rawLikes === 'string') {
    try {
      likesArr = JSON.parse(rawLikes);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(likesArr)) return [];

  // dukung format lama (array string) dan baru (array objek)
  return likesArr
    .map(l => {
      if (typeof l === 'string') return l;
      if (l && typeof l === 'object') return l.username || null;
      return null;
    })
    .filter(Boolean);
}

/**
 * Hapus data likes berdasarkan shortcode (optional, untuk sinkronisasi)
 */
export async function deleteInstaLikeByShortcode(shortcode) {
  const result = await query('DELETE FROM insta_like WHERE shortcode = $1', [shortcode]);
  return result.rowCount;
}

/**
 * (Optional) Ambil semua shortcode likes yang diupdate hari ini
 */
export async function getAllShortcodesToday() {
  const res = await query(
    `SELECT shortcode FROM insta_like WHERE (updated_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date`
  );
  return res.rows.map(r => r.shortcode);
}


export async function getLikesByShortcode(shortcode) {
  // alias untuk backward compatibility
  return getLikeUsernamesByShortcode(shortcode);
}

/**
 * Rekap likes IG per user, per hari/bulan ini
 * @param {string} client_id
 * @param {string} periode "harian"|"bulanan"
 * @returns {Promise<Array>}
 */

export async function getRekapLikesByClient(client_id, periode = "harian", tanggal, start_date, end_date) {
  let tanggalFilter = "p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  const params = [client_id];
  if (start_date && end_date) {
    params.push(start_date, end_date);
    tanggalFilter = "(p.created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date";
  } else if (periode === 'bulanan') {
    if (tanggal) {
      const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
      params.push(monthDate);
      tanggalFilter = "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $2::date)";
    } else {
      tanggalFilter = "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
    }
  } else if (periode === 'mingguan') {
    if (tanggal) {
      params.push(tanggal);
      tanggalFilter = "date_trunc('week', p.created_at) = date_trunc('week', $2::date)";
    } else {
      tanggalFilter = "date_trunc('week', p.created_at) = date_trunc('week', NOW())";
    }
  } else if (periode === 'semua') {
    tanggalFilter = '1=1';
  } else if (tanggal) {
    params.push(tanggal);
    tanggalFilter = "p.created_at::date = $2::date";
  }

  const { rows } = await query(`
    WITH cli AS (
      SELECT client_type FROM clients WHERE client_id = $1
    ),
    valid_likes AS (
      SELECT
        l.shortcode,
        p.client_id,
        p.created_at,
        lower(replace(trim(lk.username), '@', '')) AS username
      FROM insta_like l
      JOIN insta_post p ON p.shortcode = l.shortcode
      JOIN LATERAL (
        SELECT COALESCE(elem->>'username', trim(both '"' FROM elem::text)) AS username
        FROM jsonb_array_elements(l.likes) AS elem
      ) AS lk ON TRUE
      WHERE p.client_id = $1
        AND ${tanggalFilter}
    ),
    like_counts AS (
      SELECT username, COUNT(DISTINCT shortcode) AS jumlah_like
      FROM valid_likes
      GROUP BY username
    )
    SELECT
      u.user_id,
      u.title,
      u.nama,
      u.insta AS username,
      u.divisi,
      u.exception,
      COALESCE(lc.jumlah_like, 0) AS jumlah_like
    FROM "user" u
    LEFT JOIN like_counts lc
      ON lower(replace(trim(u.insta), '@', '')) = lc.username
    WHERE u.status = true
      AND u.insta IS NOT NULL
      AND (
        (SELECT client_type FROM cli) <> 'direktorat' AND u.client_id = $1
        OR (SELECT client_type FROM cli) = 'direktorat' AND EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r ON ur.role_id = r.role_id
          WHERE ur.user_id = u.user_id AND r.role_name = $1
        )
      )
    ORDER BY jumlah_like DESC, u.nama ASC
  `, params);

  for (const user of rows) {
    user.jumlah_like = parseInt(user.jumlah_like, 10);
  }

  return rows;
}