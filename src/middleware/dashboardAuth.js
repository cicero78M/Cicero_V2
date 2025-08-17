import jwt from 'jsonwebtoken';
import redis from '../config/redis.js';

export async function verifyDashboardToken(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Token required' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const exists = await redis.get(`login_token:${token}`);
    if (!exists) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (!String(exists).startsWith('dashboard:')) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    req.dashboardUser = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}
