import { query } from '../repository/db.js';

export async function upsertSearchUser(data) {
  const {
    username,
    full_name = null,
    instagram_id = null,
    is_private = null,
    is_verified = null,
    profile_pic_url = null,
  } = data;
  if (!username) return;
  await query(
    `INSERT INTO insta_user_search (username, full_name, instagram_id, is_private, is_verified, profile_pic_url, searched_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (username) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           instagram_id = EXCLUDED.instagram_id,
           is_private = EXCLUDED.is_private,
           is_verified = EXCLUDED.is_verified,
           profile_pic_url = EXCLUDED.profile_pic_url,
           searched_at = NOW()`,
    [username, full_name, instagram_id, is_private, is_verified, profile_pic_url]
  );
}

export async function findAllUsernames() {
  const res = await query('SELECT username FROM insta_user_search ORDER BY username');
  return res.rows.map(r => r.username);
}
