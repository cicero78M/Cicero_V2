import { query } from '../repository/db.js';
import { findPostByShortcode } from './instaPostModel.js';

export async function createLinkReport(data) {
  const exists = await findPostByShortcode(data.shortcode);
  if (!exists) {
    const err = new Error('shortcode not found');
    err.statusCode = 400;
    throw err;
  }

  const res = await query(
    `INSERT INTO link_report (
        shortcode, user_id, instagram_link, facebook_link,
        twitter_link, tiktok_link, youtube_link, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8, NOW()))
     ON CONFLICT (shortcode, user_id) DO UPDATE
     SET instagram_link = EXCLUDED.instagram_link,
         facebook_link = EXCLUDED.facebook_link,
         twitter_link = EXCLUDED.twitter_link,
         tiktok_link = EXCLUDED.tiktok_link,
         youtube_link = EXCLUDED.youtube_link,
         created_at = EXCLUDED.created_at
     RETURNING *`,
    [
      data.shortcode,
      data.user_id || null,
      data.instagram_link || null,
      data.facebook_link || null,
      data.twitter_link || null,
      data.tiktok_link || null,
      data.youtube_link || null,
      data.created_at || null
    ]
  );
  return res.rows[0];
}

export async function getLinkReports() {
  const res = await query(
    `SELECT r.*, p.caption, p.image_url, p.thumbnail_url
     FROM link_report r
     LEFT JOIN insta_post p ON p.shortcode = r.shortcode
     ORDER BY r.created_at DESC`
  );
  return res.rows;
}

export async function findLinkReportByShortcode(shortcode, user_id) {
  const params = [shortcode];
  const condition = user_id ? 'AND r.user_id = $2' : '';
  if (user_id) params.push(user_id);
  const res = await query(
    `SELECT r.*, p.caption, p.image_url, p.thumbnail_url
     FROM link_report r
     LEFT JOIN insta_post p ON p.shortcode = r.shortcode
     WHERE r.shortcode = $1 ${condition}`,
    params
  );
  return res.rows[0] || null;
}

export async function updateLinkReport(shortcode, user_id, data) {
  const old = await findLinkReportByShortcode(shortcode, user_id);
  if (!old) return null;
  const merged = { ...old, ...data };
  const res = await query(
    `UPDATE link_report SET
      instagram_link=$3,
      facebook_link=$4,
      twitter_link=$5,
      tiktok_link=$6,
      youtube_link=$7,
      created_at=$8
     WHERE shortcode=$1 AND user_id=$2 RETURNING *`,
    [
      shortcode,
      user_id,
      merged.instagram_link || null,
      merged.facebook_link || null,
      merged.twitter_link || null,
      merged.tiktok_link || null,
      merged.youtube_link || null,
      merged.created_at || null
    ]
  );
  return res.rows[0];
}

export async function deleteLinkReport(shortcode, user_id) {
  const res = await query('DELETE FROM link_report WHERE shortcode=$1 AND user_id=$2 RETURNING *', [shortcode, user_id]);
  return res.rows[0] || null;
}
