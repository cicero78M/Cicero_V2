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

export async function getRekapLikesByClient(
  client_id,
  periode = "harian",
  tanggal,
  start_date,
  end_date,
  role
) {
  const roleLower = role ? role.toLowerCase() : null;
  const params = [client_id];
  let tanggalFilter =
    "p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  if (start_date && end_date) {
    const startIdx = params.push(start_date);
    const endIdx = params.push(end_date);
    tanggalFilter =
      `(p.created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $${startIdx}::date AND $${endIdx}::date`;
  } else if (periode === 'bulanan') {
    if (tanggal) {
      const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
      const idx = params.push(monthDate);
        tanggalFilter =
          `date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $${idx}::date)`;
    } else {
      tanggalFilter =
        "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
    }
  } else if (periode === 'mingguan') {
    if (tanggal) {
      const idx = params.push(tanggal);
      tanggalFilter =
        `date_trunc('week', p.created_at) = date_trunc('week', $${idx}::date)`;
    } else {
      tanggalFilter = "date_trunc('week', p.created_at) = date_trunc('week', NOW())";
    }
  } else if (periode === 'semua') {
    tanggalFilter = '1=1';
  } else if (tanggal) {
    const idx = params.push(tanggal);
    tanggalFilter = `p.created_at::date = $${idx}::date`;
  }

  let postClientFilter = 'LOWER(p.client_id) = LOWER($1)';
  let userWhere = 'LOWER(u.client_id) = LOWER($1)';
  let likeCountsSelect = `
    SELECT username, client_id, COUNT(DISTINCT shortcode) AS jumlah_like
    FROM valid_likes
    GROUP BY username, client_id
  `;
  let likeJoin = `
    lower(replace(trim(u.insta), '@', '')) = lc.username
    AND LOWER(u.client_id) = LOWER(lc.client_id)
  `;
  let postRoleJoinLikes = '';
  let postRoleJoinPosts = '';
  let postRoleFilter = '';
  if (roleLower === 'ditbinmas') {
    params.shift();
    tanggalFilter = tanggalFilter.replace(/\$(\d+)/g, (_, n) => `$${n - 1}`);
    const roleIdx = params.push(roleLower);
    userWhere = `EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = u.user_id AND LOWER(r.role_name) = LOWER($${roleIdx})
    )`;
    likeCountsSelect = `
      SELECT username, COUNT(DISTINCT shortcode) AS jumlah_like
      FROM valid_likes
      GROUP BY username
    `;
    likeJoin = "lower(replace(trim(u.insta), '@', '')) = lc.username";
    postClientFilter = `COALESCE(LOWER(ro.role_name), LOWER(pr.role_name)) = LOWER($${roleIdx})`;
    postRoleJoinLikes = `
      JOIN insta_post_roles pr ON pr.shortcode = p.shortcode
      LEFT JOIN roles ro ON pr.role_id = ro.role_id
    `;
    postRoleJoinPosts = `
      JOIN insta_post_roles pr ON pr.shortcode = p.shortcode
      LEFT JOIN roles ro ON pr.role_id = ro.role_id
    `;
    postRoleFilter = '';
  }

  const { rows } = await query(`
    WITH valid_likes AS (
      SELECT
        l.shortcode,
        p.created_at,
        p.client_id,
        lower(replace(trim(lk.username), '@', '')) AS username
      FROM insta_like l
      JOIN insta_post p ON p.shortcode = l.shortcode
      ${postRoleJoinLikes}
      JOIN LATERAL (
        SELECT COALESCE(elem->>'username', trim(both '"' FROM elem::text)) AS username
        FROM jsonb_array_elements(l.likes) AS elem
      ) AS lk ON TRUE
      WHERE ${postClientFilter}
        ${postRoleFilter}
        AND ${tanggalFilter}
    ),
    like_counts AS (
      ${likeCountsSelect}
    )
    SELECT
      u.user_id,
      u.title,
      u.nama,
      u.insta AS username,
      u.divisi,
      u.exception,
      u.client_id,
      c.nama AS client_name,
      COALESCE(lc.jumlah_like, 0) AS jumlah_like
    FROM "user" u
    JOIN clients c ON c.client_id = u.client_id
    LEFT JOIN like_counts lc
      ON ${likeJoin}
    WHERE u.status = true
      AND ${userWhere}
    ORDER BY jumlah_like DESC, u.nama ASC
  `, params);

  for (const user of rows) {
    user.jumlah_like = parseInt(user.jumlah_like, 10);
  }

  const postParams = params;

  const { rows: postRows } = await query(
    `WITH posts AS (
      SELECT p.shortcode
      FROM insta_post p
      ${postRoleJoinPosts}
      WHERE ${postClientFilter}
        ${postRoleFilter}
        AND ${tanggalFilter}
    )
    SELECT COUNT(DISTINCT shortcode) AS total_post FROM posts`,
    postParams
  );
  const totalKonten = parseInt(postRows[0]?.total_post || '0', 10);

  return { rows, totalKonten };
}
