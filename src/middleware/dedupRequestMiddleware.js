import crypto from 'crypto';

// Simple LRU cache to store recent request hashes and timestamps
const cache = new Map();
const MAX_ENTRIES = 1000; // limit memory usage
const TTL_MS = 5 * 60 * 1000; // 5 minutes

function cleanup() {
  const now = Date.now();
  for (const [key, ts] of cache) {
    if (now - ts > TTL_MS) cache.delete(key);
  }
  while (cache.size > MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

export function dedupRequest(req, res, next) {
  try {
    const hash = crypto
      .createHash('sha1')
      .update(req.method + req.originalUrl + JSON.stringify(req.body || {}))
      .digest('hex');
    const now = Date.now();
    if (cache.has(hash) && now - cache.get(hash) < TTL_MS) {
      return res
        .status(429)
        .json({ success: false, message: 'Duplicate request detected' });
    }
    cache.set(hash, now);
    cleanup();
  } catch (e) {
    // If hashing fails, ignore dedup check to avoid blocking requests
  }
  next();
}
