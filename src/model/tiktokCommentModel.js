import { pool } from "../config/db.js";

/**
 * Simpan/Update komentar TikTok untuk video tertentu (merge, bukan replace).
 * Jika sudah ada, gabung komentar lama dengan yang baru (tanpa duplikat user dan id).
 * PATCH: Normalisasi, tambahkan field `username` pada setiap komentar.
 * @param {string} video_id - ID video TikTok
 * @param {Array} commentsArr - Array of comment objects
 */
export async function upsertTiktokComments(video_id, commentsArr) {
  // Ambil komentar lama dulu
  const qSelect = `SELECT comments FROM tiktok_comment WHERE video_id = $1`;
  const res = await pool.query(qSelect, [video_id]);
  let existing = [];
  if (res.rows[0] && Array.isArray(res.rows[0].comments)) {
    existing = res.rows[0].comments;
  }

  // PATCH: Normalisasi username pada setiap komentar
  function normalizeUsername(comment) {
    if (!comment) return comment;
    // Jika sudah ada field username, biarkan
    if (comment.username && typeof comment.username === "string" && comment.username.length > 0) return comment;
    // Jika punya user.unique_id, salin ke username
    if (comment.user && typeof comment.user.unique_id === "string") {
      return { ...comment, username: comment.user.unique_id };
    }
    // fallback, tetap kembalikan objek as is
    return comment;
  }

  // Gabungkan tanpa duplikat (berdasarkan id komentar) + normalisasi username
  const byId = {};
  for (const k of existing) {
    const norm = normalizeUsername(k);
    if (norm && norm.cid) byId[norm.cid] = norm;
  }
  for (const k of commentsArr) {
    const norm = normalizeUsername(k);
    if (norm && norm.cid) byId[norm.cid] = norm;
  }
  // Array hasil merge
  const merged = Object.values(byId);

  // Upsert ke DB
  const qUpsert = `
    INSERT INTO tiktok_comment (video_id, comments, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (video_id)
    DO UPDATE SET comments = $2, updated_at = NOW()
  `;
  await pool.query(qUpsert, [video_id, JSON.stringify(merged)]);
}

/**
 * Ambil array komentar TikTok untuk video tertentu.
 * @param {string} video_id - ID video TikTok
 * @returns {Object} { comments: [...] }
 */
export async function getCommentsByVideoId(video_id) {
  const q = `SELECT comments FROM tiktok_comment WHERE video_id = $1`;
  const res = await pool.query(q, [video_id]);
  return res.rows[0] ? { comments: res.rows[0].comments } : { comments: [] };
}
