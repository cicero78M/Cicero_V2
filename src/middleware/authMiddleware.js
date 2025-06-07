import jwt from "jsonwebtoken";

export function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: "Token diperlukan" });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "secretkey");
    req.user = payload; // untuk akses role/client_id di handler berikutnya
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Token tidak valid" });
  }
}
