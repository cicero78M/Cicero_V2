import { pool } from '../config/db.js';

// Upsert array username komentar TikTok ke DB (key: video_id)
export async function upsertTiktokComments(video_id, comments) {
  await pool.query(
    `INSERT INTO tiktok_comment (video_id, comments, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (video_id) DO UPDATE
     SET comments = EXCLUDED.comments, updated_at = NOW()`,
    [video_id, JSON.stringify(comments)]
  );
}

// Ambil seluruh array username yang komentar pada video_id
export async function getCommentsByVideoId(video_id) {
  const res = await pool.query(
    `SELECT comments FROM tiktok_comment WHERE video_id = $1`,
    [video_id]
  );
  if (!res.rowCount) return [];

  let comments = res.rows[0].comments;
  // Jika comments berupa string (JSONB as string), parse ke array
  if (typeof comments === 'string') {
    try { comments = JSON.parse(comments); } catch { return []; }
  }
  if (!Array.isArray(comments)) return [];

  // Array username string (['user1','user2',...])
  if (typeof comments[0] === 'string') return comments;
  // Array objek, fallback ke field unique_id (jika data hasil migrasi lama)
  if (typeof comments[0] === 'object') {
    return comments.map(c => c.unique_id || c.user?.unique_id).filter(Boolean);
  }
  return [];
}
