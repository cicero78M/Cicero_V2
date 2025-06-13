import redis from '../config/redis.js';

export async function insertCache(username, posts) {
  if (!username) return;
  const key = `insta:posts:${username}`;
  const value = JSON.stringify({ posts, fetched_at: new Date().toISOString() });
  await redis.set(key, value);
}

export async function getLatestCache(username) {
  const key = `insta:posts:${username}`;
  const val = await redis.get(key);
  if (!val) return null;
  return JSON.parse(val);
}
