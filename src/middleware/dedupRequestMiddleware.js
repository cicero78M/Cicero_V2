import crypto from 'crypto';
import redis from '../config/redis.js';

const TTL_SEC = 5 * 60; // 5 minutes

export async function dedupRequest(req, res, next) {
  try {
    const hash = crypto
      .createHash('sha1')
      .update(req.method + req.originalUrl + JSON.stringify(req.body || {}))
      .digest('hex');
    const key = `dedup:${hash}`;
    const exists = await redis.exists(key);
    if (exists) {
      return res
        .status(429)
        .json({ success: false, message: 'Duplicate request detected' });
    }
    await redis.set(key, '1', { EX: TTL_SEC });
  } catch (e) {
    // If hashing fails or redis error, ignore dedup check
  }
  next();
}
