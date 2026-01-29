// src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';

const operatorAllowlist = [
  { path: '/clients/profile', type: 'exact' },
  { path: '/aggregator', type: 'prefix' },
  { path: '/amplify/rekap', type: 'exact' },
  { path: '/dashboard/stats', type: 'exact' },
  { path: '/dashboard/login-web/recap', type: 'exact' },
  { path: '/dashboard/social-media/instagram/analysis', type: 'exact' },
  { path: '/insta/rekap-likes', type: 'exact' },
  { path: '/insta/rapid-profile', type: 'exact' },
  { path: '/users', type: 'exact' },
  { path: '/users/create', type: 'exact' },
  { path: '/users/list', type: 'exact' },
];

function isOperatorAllowedPath(pathname) {
  return operatorAllowlist.some(({ path, type }) => {
    if (type === 'prefix') {
      return pathname === path || pathname.startsWith(`${path}/`);
    }
    return pathname === path;
  });
}

export function authRequired(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Token required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    if (decoded.role === 'operator' && !isOperatorAllowedPath(req.path)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  } catch (err) {
    // Bisa log err di backend untuk trace
    return res.status(401).json({ success: false, message: 'Invalid token', error: err.message });
  }
}
