import { query } from '../repository/db.js';

/**
 * Simpan/Update komentar TikTok untuk video tertentu.
 * Yang disimpan ke DB: hanya array username unik (string) tanpa awalan "@",
 * bukan objek komentar.
 * @param {string} video_id - ID video TikTok
 * @param {Array} commentsArr - Array of comment objects dari API
 */
export async function upsertTiktokComments(video_id, commentsArr) {
  // Ambil username dari commentsArr (prioritas: user.unique_id, fallback: username)
  const usernames = [];
  for (const c of commentsArr) {
    let uname = null;
    if (c && c.user && typeof c.user.unique_id === "string") {
      uname = c.user.unique_id;
    } else if (c && typeof c.username === "string") {
      uname = c.username;
    }
    if (uname && uname.length > 0) {
      usernames.push(uname.toLowerCase().replace(/^@/, ""));
    }
  }
  // Unikkan username (no duplicate)
  const uniqUsernames = [...new Set(usernames)];

  // Gabungkan dengan yang sudah ada (jika ada di DB)
  const qSelect = `SELECT comments FROM tiktok_comment WHERE video_id = $1`;
  const res = await query(qSelect, [video_id]);
  let existing = [];
  if (res.rows[0] && Array.isArray(res.rows[0].comments)) {
    existing = res.rows[0].comments
      .map((u) =>
        typeof u === "string" ? u.toLowerCase().replace(/^@/, "") : null
      )
      .filter(Boolean);
  }
  // Merge dan unikkan lagi
  const finalUsernames = [...new Set([...existing, ...uniqUsernames])];

  // Upsert ke DB (hanya username array!)
  const qUpsert = `
    INSERT INTO tiktok_comment (video_id, comments, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (video_id)
    DO UPDATE SET comments = $2, updated_at = NOW()
  `;
  await query(qUpsert, [video_id, JSON.stringify(finalUsernames)]);
}

/**
 * Ambil array username yang berkomentar untuk video tertentu.
 * @param {string} video_id - ID video TikTok
 * @returns {Object} { comments: [username, ...] }
 */
export async function getCommentsByVideoId(video_id) {
  const q = `SELECT comments FROM tiktok_comment WHERE video_id = $1`;
  const res = await query(q, [video_id]);
  return res.rows[0] ? { comments: res.rows[0].comments } : { comments: [] };
}

export const findByVideoId = getCommentsByVideoId;


export async function getRekapKomentarByClient(
  client_id,
  periode = "harian",
  tanggal
) {
  let tanggalFilter =
    "p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  const params = [client_id];
  if (periode === "semua") {
    tanggalFilter = "1=1";
  } else if (periode === "mingguan") {
    if (tanggal) {
      params.push(tanggal);
      tanggalFilter =
        "date_trunc('week', p.created_at) = date_trunc('week', $2::date)";
    } else {
      tanggalFilter = "date_trunc('week', p.created_at) = date_trunc('week', NOW())";
    }
  } else if (periode === "bulanan") {
    if (tanggal) {
      const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
      params.push(monthDate);
      tanggalFilter =
        "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $2::date)";
    } else {
      tanggalFilter =
        "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
    }
  } else if (tanggal) {
    params.push(tanggal);
    tanggalFilter = "p.created_at::date = $2::date";
  }

  const { rows: postRows } = await query(
    `SELECT COUNT(*) AS jumlah_post FROM tiktok_post p WHERE p.client_id = $1 AND ${tanggalFilter}`,
    params
  );
  const max_comment = parseInt(postRows[0]?.jumlah_post || "0", 10);

  const { rows } = await query(`
    WITH valid_comments AS (
      SELECT c.video_id, p.client_id, p.created_at, c.comments
      FROM tiktok_comment c
      JOIN tiktok_post p ON p.video_id = c.video_id
      WHERE p.client_id = $1
        AND ${tanggalFilter}
    )
    SELECT
      u.user_id,
      u.title,
      u.nama,
      u.tiktok AS username,
      u.divisi,
      u.exception,
      COALESCE(COUNT(DISTINCT vc.video_id), 0) AS jumlah_komentar
    FROM "user" u
    LEFT JOIN valid_comments vc
      ON EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(vc.comments) cmt
        WHERE lower(replace(trim(cmt), '@', '')) = lower(replace(trim(u.tiktok), '@', ''))
      )
    WHERE u.client_id = $1
      AND u.status = true
      AND u.tiktok IS NOT NULL
    GROUP BY u.user_id, u.title, u.nama, u.tiktok, u.divisi, u.exception
    ORDER BY jumlah_komentar DESC, u.nama ASC
  `, params);

  for (const user of rows) {
    if (
      user.exception === true ||
      user.exception === "true" ||
      user.exception == 1 ||
      user.exception === "1"
    ) {
      user.jumlah_komentar = max_comment;
    } else {
      user.jumlah_komentar = parseInt(user.jumlah_komentar, 10);
    }
    user.display_nama = user.title ? `${user.title} ${user.nama}` : user.nama;
  }

  return rows;
}


