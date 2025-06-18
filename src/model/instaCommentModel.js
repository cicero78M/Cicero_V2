import { query } from '../repository/db.js';

export async function upsertInstaComments(shortcode, commentsArr = []) {
  if (!shortcode) return;
  const usernames = [];
  for (const c of commentsArr) {
    let uname = null;
    if (c && c.user && typeof c.user.username === 'string') {
      uname = c.user.username;
    } else if (c && typeof c.username === 'string') {
      uname = c.username;
    }
    if (uname) {
      usernames.push(uname.toLowerCase().replace(/^@/, ''));
    }
  }
  const uniq = [...new Set(usernames)];
  const res = await query('SELECT comments FROM insta_comment WHERE shortcode = $1', [shortcode]);
  let existing = [];
  if (res.rows[0] && Array.isArray(res.rows[0].comments)) {
    existing = res.rows[0].comments
      .map(u => (typeof u === 'string' ? u.toLowerCase().replace(/^@/, '') : null))
      .filter(Boolean);
  }
  const finalUsernames = [...new Set([...existing, ...uniq])];
  const sql = `
    INSERT INTO insta_comment (shortcode, comments, updated_at)
    VALUES ($1,$2,NOW())
    ON CONFLICT (shortcode) DO UPDATE SET comments = $2, updated_at = NOW()
  `;
  await query(sql, [shortcode, JSON.stringify(finalUsernames)]);
}

export async function getCommentsByShortcode(shortcode) {
  const res = await query('SELECT comments FROM insta_comment WHERE shortcode = $1', [shortcode]);
  return res.rows[0] ? { comments: res.rows[0].comments } : { comments: [] };
}

export const findByShortcode = getCommentsByShortcode;
