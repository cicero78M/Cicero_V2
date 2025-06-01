// src/model/tiktokCommentModel.js

import { pool } from '../config/db.js';

/**
 * Simpan (replace) komentar TikTok ke DB untuk 1 video.
 * @param {string} video_id
 * @param {string[]} comments - array username yang berkomentar
 */
export async function saveTiktokComments(video_id, comments) {
  await pool.query(`DELETE FROM tiktok_comment WHERE video_id = $1`, [video_id]);
  if (!comments || comments.length === 0) return;
  // Insert bulk
  const values = comments.map((c, i) => `($1, $${i+2})`).join(',');
  await pool.query(
    `INSERT INTO tiktok_comment (video_id, username) VALUES ${values}`,
    [video_id, ...comments]
  );
}

/**
 * Upsert komentar TikTok (replace semua) untuk 1 video (alias dari saveTiktokComments)
 * @param {string} video_id
 * @param {string[]} commenters
 */
export async function upsertTiktokComments(video_id, commenters) {
  return saveTiktokComments(video_id, commenters);
}

/**
 * Ambil seluruh username yang berkomentar di video TikTok (by video_id)
 * @param {string} video_id
 * @returns {Promise<string[]>}
 */
export async function getCommentsByVideoId(video_id) {
  const res = await pool.query(
    `SELECT username FROM tiktok_comment WHERE video_id = $1`,
    [video_id]
  );
  return res.rows.map(r => r.username);
}
