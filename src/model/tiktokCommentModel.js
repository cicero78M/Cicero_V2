import { pool } from '../config/db.js';

// Upsert komentar (jsonb) TikTok berdasarkan video_id
export async function saveTiktokComments(video_id, commentsArr) {
  // commentsArr: array of objek comment dari API, simpan langsung dalam 1 array JSON
  if (!video_id || !Array.isArray(commentsArr)) return false;
  await pool.query(
    `INSERT INTO tiktok_comment (video_id, comments, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (video_id)
     DO UPDATE SET
        comments = EXCLUDED.comments,
        updated_at = NOW()`,
    [
      video_id,
      JSON.stringify(commentsArr)
    ]
  );
  return true;
}

// Ambil komentar untuk video_id tertentu
export async function getCommentsByVideoId(video_id) {
  const res = await pool.query(
    `SELECT comments FROM tiktok_comment WHERE video_id = $1`,
    [video_id]
  );
  return res.rows[0]?.comments || [];
}
