import { pool } from '../config/db.js';

export async function getRekapLikesByClient(client_id, periode = "harian") {
  let dateFilter = "l.created_at::date = NOW()::date";
  if (periode === "bulanan") {
    dateFilter = "date_trunc('month', l.created_at) = date_trunc('month', NOW())";
  }

  const { rows } = await pool.query(`
    SELECT
      u.user_id,
      u.nama,
      u.insta AS username,
      u.divisi,
      u.exception,
      COALESCE(COUNT(DISTINCT l.shortcode), 0) AS jumlah_like
    FROM "user" u
    LEFT JOIN insta_like l
      ON l.likes @> to_jsonb(u.insta)
      AND l.client_id = $1
      AND ${dateFilter}
    WHERE u.client_id = $1
      AND u.status = true
      AND u.insta IS NOT NULL
    GROUP BY u.user_id, u.nama, u.insta, u.divisi, u.exception
    ORDER BY jumlah_like DESC, u.nama ASC
  `, [client_id]);
  return rows;
}
