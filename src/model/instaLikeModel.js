// src/model/instaLikeModel.js
import { pool } from '../config/db.js';

/**
 * Upsert (insert/update) daftar username likes untuk sebuah shortcode.
 * Disarankan kolom likes bertipe JSONB.
 */
export async function upsertInstaLike(shortcode, likes) {
  const result = await pool.query(
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
  const res = await pool.query('SELECT likes FROM insta_like WHERE shortcode = $1', [shortcode]);
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
  const result = await pool.query('DELETE FROM insta_like WHERE shortcode = $1', [shortcode]);
  return result.rowCount;
}

/**
 * (Optional) Ambil semua shortcode likes yang diupdate hari ini
 */
export async function getAllShortcodesToday() {
  const res = await pool.query(
    `SELECT shortcode FROM insta_like WHERE DATE(updated_at) = CURRENT_DATE`
  );
  return res.rows.map(r => r.shortcode);
}


export async function getLikesByShortcode(shortcode) {
  const res = await pool.query(
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

export async function getRekapLikesByClient(client_id) {
  const { rows } = await pool.query(
    `
    SELECT
      u.user_id,
      u.nama,
      u.insta AS username,
      u.exception,  -- <==== Tambahkan!
      COUNT(like_users.username) AS jumlah_like
    FROM
      "user" u
    LEFT JOIN LATERAL (
      ...
    ) like_users ON TRUE
    WHERE
      u.client_id = $1
      AND u.status = true
      AND u.insta IS NOT NULL
    GROUP BY
      u.user_id, u.nama, u.insta, u.exception
    ORDER BY
      jumlah_like DESC
    `,
    [client_id]
  );
  return rows;
}

