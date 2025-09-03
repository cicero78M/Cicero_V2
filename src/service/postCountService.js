import redis from '../config/redis.js';
import { countPostsByClient as countInstaPostsByClient } from '../model/instaPostModel.js';
import { countPostsByClient as countTiktokPostsByClient } from '../model/tiktokPostModel.js';

const TTL_SEC = 60; // cache 1 minute

function buildKey(platform, clientId, periode, tanggal, startDate, endDate) {
  return `${platform}:post_count:${clientId}:${periode}:${tanggal || ''}:${startDate || ''}:${endDate || ''}`;
}

async function getCachedCount(platform, clientId, periode, tanggal, startDate, endDate, fetchFn) {
  const key = buildKey(platform, clientId, periode, tanggal, startDate, endDate);
  const cached = await redis.get(key);
  if (cached !== null) return parseInt(cached, 10);
  const count = await fetchFn(clientId, periode, tanggal, startDate, endDate);
  await redis.set(key, String(count), { EX: TTL_SEC });
  return count;
}

export function getInstaPostCount(clientId, periode, tanggal, startDate, endDate) {
  return getCachedCount('instagram', clientId, periode, tanggal, startDate, endDate, countInstaPostsByClient);
}

export function getTiktokPostCount(clientId, periode, tanggal, startDate, endDate) {
  return getCachedCount('tiktok', clientId, periode, tanggal, startDate, endDate, countTiktokPostsByClient);
}

