import crypto from 'crypto';
import redis from '../config/redis.js';

const TTL_SEC = 5 * 60; // 5 minutes

export async function dedupRequest(req, res, next) {
  // Skip all checks if disabled via env var
  if (process.env.ALLOW_DUPLICATE_REQUESTS === 'true') {
    return next();
  }

  // Allow duplicate requests for the root path or for all GET requests
  if (req.path === '/' || req.method === 'GET') {
    return next();
  }
  try {
    const tokenPart = req.headers.authorization
      ? req.headers.authorization.split(' ')[1]
      : '';
    const userPart =
      tokenPart ||
      req.user?.client_id ||
      req.headers['x-client-id'] ||
      req.ip ||
      '';
    const hash = crypto
      .createHash('sha1')
      .update(
        req.method +
          req.originalUrl +
          JSON.stringify(req.body || {}) +
          userPart
      )
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
