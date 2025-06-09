// src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';

export function authRequired(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Token required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secretkey");
    req.user = decoded;
    next();
  } catch (err) {
    // Bisa log err di backend untuk trace
    return res.status(401).json({ success: false, message: 'Invalid token', error: err.message });
  }
}


