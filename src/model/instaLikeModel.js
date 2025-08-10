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
  const likesVal = res.rows[0].likes;
  if (!likesVal) return [];
  if (Array.isArray(likesVal)) return likesVal;
  if (typeof likesVal === 'string') {
    try {
      return JSON.parse(likesVal) || [];
    } catch {
      return [];
    }
  }
  return [];
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
  const res = await query(
    `SELECT likes FROM insta_like WHERE shortcode = $1`,
    [shortcode]
  );
  if (res.rows.length === 0) return [];
  // likes harus array of string (username)
  try {
    return Array.isArray(res.rows[0].likes)
      ? res.rows[0].likes
      : JSON.parse(res.rows[0].likes);
  } catch {
    return [];
  }
}

/**
 * Rekap likes IG per user, per hari/bulan ini
 * @param {string} client_id
 * @param {string} periode "harian"|"bulanan"
 * @returns {Promise<Array>}
 */

export async function getRekapLikesByClient(client_id, periode = "harian", tanggal, start_date, end_date) {
  let tanggalFilter = "(created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  const params = [client_id];
  if (start_date && end_date) {
    params.push(start_date, end_date);
    tanggalFilter = "(created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date";
  } else if (periode === 'semua') {
    tanggalFilter = '1=1';
  } else if (periode === 'mingguan') {
    if (tanggal) {
      params.push(tanggal);
      tanggalFilter = "date_trunc('week', created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('week', $2::date)";
    } else {
      tanggalFilter = "date_trunc('week', created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('week', NOW() AT TIME ZONE 'Asia/Jakarta')";
    }
  } else if (periode === 'bulanan') {
    if (tanggal) {
      const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
      params.push(monthDate);
      tanggalFilter = "date_trunc('month', created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $2::date)";
    } else {
      tanggalFilter = "date_trunc('month', created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
    }
  } else if (tanggal) {
    params.push(tanggal);
    tanggalFilter = "(created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date";
  }

  // Ambil jumlah post IG untuk periode
  const { rows: postRows } = await query(
    `SELECT COUNT(*) AS jumlah_post FROM insta_post WHERE client_id = $1 AND ${tanggalFilter}`,
    params
  );
  const max_like = parseInt(postRows[0]?.jumlah_post || "0", 10);
  const threshold = Math.ceil(max_like * 0.2);

  // CTE
  const { rows } = await query(`
    WITH valid_likes AS (
      SELECT
        l.shortcode,
        p.client_id,
        p.created_at,
        lower(replace(trim(lk.like_obj->>'username'), '@', '')) AS username
      FROM insta_like l
      JOIN insta_post p ON p.shortcode = l.shortcode
      JOIN LATERAL jsonb_array_elements(l.likes) AS lk(like_obj) ON TRUE
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
    WHERE u.client_id = $1
      AND u.status = true
      AND u.insta IS NOT NULL
    ORDER BY jumlah_like DESC, u.nama ASC
  `, params);

  // Untuk exception, set jumlah_like = max_like
  for (const user of rows) {
    if (user.exception === true || user.exception === "true" || user.exception === 1 || user.exception === "1") {
      user.jumlah_like = max_like;
    } else {
      user.jumlah_like = parseInt(user.jumlah_like, 10);
    }
    // Tambahkan field display_nama (opsional, untuk frontend)
    user.display_nama = user.title ? `${user.title} ${user.nama}` : user.nama;
    user.sudahMelaksanakan = user.jumlah_like >= threshold;
  }

  return rows;
}

