// src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';

export function authRequired(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Token required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    if (decoded.role === 'operator') {
      const path = req.path;
      const method = req.method.toLowerCase();

      // Routes that operator can access with any method
      const allowedPrefixes = ['/claim', '/clients/profile'];

      // Additional data-fetching routes allowed only for GET requests
      const allowedGetPrefixes = ['/users', '/dashboard', '/amplify'];

      const allowed =
        allowedPrefixes.some(p => path.startsWith(p)) ||
        (method === 'get' && allowedGetPrefixes.some(p => path.startsWith(p)));

      if (!allowed) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }
    next();
  } catch (err) {
    // Bisa log err di backend untuk trace
    return res.status(401).json({ success: false, message: 'Invalid token', error: err.message });
  }
}


