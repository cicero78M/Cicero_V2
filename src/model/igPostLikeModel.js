// src/model/igPostLikeModel.js
import { query } from '../repository/db.js';

// Upsert like usernames for a post_id
export async function upsertIgPostLike(postId, likes = []) {
  if (!postId) return;
  await query(
    `INSERT INTO ig_post_likes (post_id, likes, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (post_id) DO UPDATE
     SET likes = EXCLUDED.likes, updated_at = NOW()`,
    [postId, JSON.stringify(likes)]
  );
}

// Get likes array by post_id
export async function getLikesByPostId(postId) {
  if (!postId) return [];
  const { rows } = await query(
    'SELECT likes FROM ig_post_likes WHERE post_id = $1',
    [postId]
  );
  if (!rows.length) return [];
  const val = rows[0].likes;
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) || [];
    } catch {
      return [];
    }
  }
  return [];
}
