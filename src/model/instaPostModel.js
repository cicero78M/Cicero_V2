// src/model/instaPostModel.js
import { query } from '../repository/db.js';

export async function upsertInstaPost(data) {
  // Pastikan field yang dipakai sesuai dengan kolom di DB
  const {
    client_id,
    shortcode,
    caption = null,
    comment_count = 0,
    thumbnail_url = null,
    is_video = false,
    video_url = null,
    image_url = null,
  } = data;

  // created_at bisa dihandle via taken_at di service (lihat service)
  await query(
    `INSERT INTO insta_post (client_id, shortcode, caption, comment_count, thumbnail_url, is_video, video_url, image_url, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, NOW()))
     ON CONFLICT (shortcode) DO UPDATE
     SET client_id = EXCLUDED.client_id,
         caption = EXCLUDED.caption,
         comment_count = EXCLUDED.comment_count,
         thumbnail_url = EXCLUDED.thumbnail_url,
         is_video = EXCLUDED.is_video,
         video_url = EXCLUDED.video_url,
         image_url = EXCLUDED.image_url,
         created_at = EXCLUDED.created_at`,
    [client_id, shortcode, caption, comment_count, thumbnail_url, is_video, video_url, image_url, data.created_at || null]
  );
}

export async function getShortcodesTodayByClient(client_id) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const res = await query(
    `SELECT shortcode FROM insta_post
     WHERE client_id = $1 AND DATE(created_at) = $2`,
    [client_id, `${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map(r => r.shortcode);
}

export async function getShortcodesTodayByUsername(username) {
  if (!username) return [];
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const res = await query(
    `SELECT p.shortcode FROM insta_post p JOIN clients c ON c.client_id = p.client_id
     WHERE c.client_insta = $1 AND DATE(p.created_at) = $2`,
    [username, `${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map(r => r.shortcode);
}


export async function getPostsTodayByClient(client_id) {
  const res = await query(
    `SELECT * FROM insta_post WHERE client_id = $1 AND created_at::date = NOW()::date`,
    [client_id]
  );
  return res.rows;
}

export async function getPostsByClientId(client_id) {
  const res = await query(
    `SELECT * FROM insta_post WHERE client_id = $1 ORDER BY created_at DESC`,
    [client_id]
  );
  return res.rows;
}

export async function findByClientId(client_id) {
  return getPostsByClientId(client_id);
}
