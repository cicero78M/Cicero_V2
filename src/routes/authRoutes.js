import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { client_id, client_operator } = req.body;
  // Validasi input
  if (!client_id || !client_operator) {
    return res.status(400).json({ success: false, message: "client_id dan client_operator wajib diisi" });
  }

  // Cari client dari DB
  const { rows } = await pool.query(
    'SELECT * FROM clients WHERE client_id = $1 AND client_operator = $2',
    [client_id, client_operator]
  );
  const client = rows[0];

  if (!client) {
    return res.status(401).json({ success: false, message: "Login gagal: client_id/operator salah" });
  }

  // Generate JWT token
  const payload = { client_id: client.client_id, nama: client.nama, role: 'client' };
  const token = jwt.sign(payload, process.env.JWT_SECRET || "secretkey", { expiresIn: "2h" });

  return res.json({ success: true, token, client: payload });
});

export default router;
