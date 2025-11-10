import { query } from '../repository/db.js';

const DEFAULT_ACTIVITY_START = '2025-09-01';

function normalizeUsername(uname) {
  if (typeof uname !== 'string' || uname.length === 0) return null;
  const lower = uname.toLowerCase();
  return lower.startsWith('@') ? lower : `@${lower}`;
}

function normalizeUsernameForSearch(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^@+/, '').toLowerCase();
}

function toTimestampParam(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isNaN(time)) return null;
    return value.toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    return null;
  }
  return date.toISOString();
}

/**
 * Simpan/Update komentar TikTok untuk video tertentu.
 * Yang disimpan ke DB: hanya array username unik (string) dengan awalan "@",
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
    const normalized = normalizeUsername(uname);
    if (normalized) usernames.push(normalized);
  }
  // Unikkan username (no duplicate)
  const uniqUsernames = [...new Set(usernames)];

  // Gabungkan dengan yang sudah ada (jika ada di DB)
  const qSelect = `SELECT comments FROM tiktok_comment WHERE video_id = $1`;
  const res = await query(qSelect, [video_id]);
  let existing = [];
  if (res.rows[0] && Array.isArray(res.rows[0].comments)) {
    existing = res.rows[0].comments
      .map((u) => normalizeUsername(u))
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

export async function hasUserCommentedBetween(
  username,
  startDate = DEFAULT_ACTIVITY_START,
  endDate,
  clientId
) {
  const normalized = normalizeUsernameForSearch(username);
  if (!normalized) return 0;

  const startParam = toTimestampParam(startDate) || DEFAULT_ACTIVITY_START;
  const endParam = toTimestampParam(endDate);
  const params = [normalized, startParam, endParam];

  let clientParamIndex = null;
  if (clientId) {
    clientParamIndex = params.push(clientId);
  }

  const queryText = `
    SELECT COUNT(DISTINCT c.video_id) AS total_activity
    FROM tiktok_comment c
    JOIN tiktok_post p ON p.video_id = c.video_id
    JOIN LATERAL (
      SELECT lower(replace(trim(raw_username), '@', '')) AS username
      FROM jsonb_array_elements_text(COALESCE(c.comments, '[]'::jsonb)) AS raw(raw_username)
    ) AS commenter ON commenter.username = $1
    WHERE (p.created_at AT TIME ZONE 'Asia/Jakarta') BETWEEN $2::timestamptz AND COALESCE($3::timestamptz, NOW())
      ${clientParamIndex ? `AND LOWER(p.client_id) = LOWER($${clientParamIndex})` : ''}
  `;

  const { rows } = await query(queryText, params);
  const total = Number(rows[0]?.total_activity || 0);
  return Number.isFinite(total) ? total : 0;
}

export const findByVideoId = getCommentsByVideoId;


export async function getRekapKomentarByClient(
  client_id,
  periode = "harian",
  tanggal,
  start_date,
  end_date,
  role
) {
  const clientTypeRes = await query(
    "SELECT client_type FROM clients WHERE client_id = $1",
    [client_id]
  );
  const clientType = clientTypeRes.rows[0]?.client_type?.toLowerCase();
  const roleLower = typeof role === 'string' ? role.toLowerCase() : null;

  const params = clientType === "direktorat" ? [] : [client_id];
  let tanggalFilter =
    "c.updated_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  if (start_date && end_date) {
    const startIdx = params.push(start_date);
    const endIdx = params.push(end_date);
    tanggalFilter = `(c.updated_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $${startIdx}::date AND $${endIdx}::date`;
  } else if (periode === "semua") {
    tanggalFilter = "1=1";
  } else if (periode === "mingguan") {
    if (tanggal) {
      const idx = params.push(tanggal);
      tanggalFilter = `date_trunc('week', c.updated_at) = date_trunc('week', $${idx}::date)`;
    } else {
      tanggalFilter = "date_trunc('week', c.updated_at) = date_trunc('week', NOW())";
    }
  } else if (periode === "bulanan") {
    if (tanggal) {
      const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
      const idx = params.push(monthDate);
      tanggalFilter = `date_trunc('month', c.updated_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $${idx}::date)`;
    } else {
      tanggalFilter =
        "date_trunc('month', c.updated_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
    }
  } else if (tanggal) {
    const idx = params.push(tanggal);
    tanggalFilter = `c.updated_at::date = $${idx}::date`;
  }

  let postClientFilter = "LOWER(p.client_id) = LOWER($1)";
  let userWhere = "LOWER(u.client_id) = LOWER($1)";
  if (clientType === "direktorat") {
    postClientFilter = "1=1";
    const effectiveRole = (roleLower || String(client_id || "")).toLowerCase();
    const roleIdx = params.push(effectiveRole);
    userWhere = `EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = u.user_id AND LOWER(r.role_name) = LOWER($${roleIdx})
    )`;
  } else if (roleLower && roleLower !== "operator") {
    const roleIdx = params.push(roleLower);
    userWhere = `LOWER(u.client_id) = LOWER($1) AND EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = u.user_id AND LOWER(r.role_name) = LOWER($${roleIdx})
    )`;
  }

  const { rows } = await query(
    `WITH valid_comments AS (
      SELECT c.video_id,
             c.updated_at,
             lower(replace(trim(cmt), '@', '')) AS username
      FROM tiktok_comment c
      JOIN tiktok_post p ON p.video_id = c.video_id
      JOIN LATERAL jsonb_array_elements_text(c.comments) cmt ON TRUE
      WHERE ${postClientFilter} AND ${tanggalFilter}
    ),
    comment_counts AS (
      SELECT username, COUNT(DISTINCT video_id) AS jumlah_komentar
      FROM valid_comments
      GROUP BY username
    )
    SELECT
      u.client_id,
      u.user_id,
      u.title,
      u.nama,
      u.tiktok AS username,
      u.divisi,
      cl.nama AS client_name,
      COALESCE(cc.jumlah_komentar, 0) AS jumlah_komentar
    FROM "user" u
    JOIN clients cl ON cl.client_id = u.client_id
    LEFT JOIN comment_counts cc
      ON lower(replace(trim(coalesce(u.tiktok, '')), '@', '')) = cc.username
    WHERE u.status = true
      AND ${userWhere}
    ORDER BY jumlah_komentar DESC, u.nama ASC`,
    params
  );
  for (const user of rows) {
    user.jumlah_komentar = parseInt(user.jumlah_komentar, 10);
  }

  return rows;
}


