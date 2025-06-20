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
    `SELECT shortcode FROM insta_like WHERE DATE(updated_at) = CURRENT_DATE`
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

export async function getRekapLikesByClient(client_id, periode = "harian") {
  let tanggalFilter = "created_at::date = NOW()::date";
  if (periode === "bulanan") {
    tanggalFilter = "date_trunc('month', created_at) = date_trunc('month', NOW())";
  }

  // Ambil jumlah post IG untuk periode
  const { rows: postRows } = await query(
    `SELECT COUNT(*) AS jumlah_post FROM insta_post WHERE client_id = $1 AND ${tanggalFilter}`,
    [client_id]
  );
  const max_like = parseInt(postRows[0]?.jumlah_post || "0", 10);

  // CTE
  const { rows } = await query(`
    WITH valid_likes AS (
      SELECT
        l.shortcode,
        p.client_id,
        p.created_at,
        l.likes
      FROM insta_like l
      JOIN insta_post p ON p.shortcode = l.shortcode
      WHERE p.client_id = $1
        AND ${tanggalFilter}
    )
    SELECT
      u.user_id,
      u.title,
      u.nama,
      u.insta AS username,
      u.divisi,
      u.exception,
      COALESCE(COUNT(DISTINCT vl.shortcode), 0) AS jumlah_like
    FROM "user" u
    LEFT JOIN valid_likes vl
      ON vl.likes @> to_jsonb(u.insta)
    WHERE u.client_id = $1
      AND u.status = true
      AND u.insta IS NOT NULL
    GROUP BY u.user_id, u.title, u.nama, u.insta, u.divisi, u.exception
    ORDER BY jumlah_like DESC, u.nama ASC
  `, [client_id]);

  // Untuk exception, set jumlah_like = max_like
  for (const user of rows) {
    if (user.exception === true || user.exception === "true" || user.exception === 1 || user.exception === "1") {
      user.jumlah_like = max_like;
    } else {
      user.jumlah_like = parseInt(user.jumlah_like, 10);
    }
    // Tambahkan field display_nama (opsional, untuk frontend)
    user.display_nama = user.title ? `${user.title} ${user.nama}` : user.nama;
  }

  return rows;
}

