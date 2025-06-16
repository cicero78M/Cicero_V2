import express from "express";
import jwt from "jsonwebtoken";
import { query } from "../db/index.js";
import { isAdminWhatsApp, formatToWhatsAppId } from "../utils/waHelper.js";
import redis from "../config/redis.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { client_id, client_operator } = req.body;
  // Validasi input
  if (!client_id || !client_operator) {
    return res
      .status(400)
      .json({
        success: false,
        message: "client_id dan client_operator wajib diisi",
      });
  }
  // Cari client berdasarkan ID saja
  const { rows } = await query(
    "SELECT * FROM clients WHERE client_id = $1",
    [client_id]
  );
  const client = rows[0];
  // Jika client tidak ditemukan
  if (!client) {
    return res.status(401).json({
      success: false,
      message: "Login gagal: client_id tidak ditemukan",
    });
  }

  // Cek operator yang diberikan: boleh operator asli atau admin
  const inputId = formatToWhatsAppId(client_operator);
  const dbOperator = client.client_operator
    ? formatToWhatsAppId(client.client_operator)
    : "";

  const isValidOperator =
    inputId === dbOperator ||
    client_operator === client.client_operator ||
    isAdminWhatsApp(inputId) ||
    isAdminWhatsApp(client_operator);

  if (!isValidOperator) {
    return res.status(401).json({
      success: false,
      message: "Login gagal: client operator tidak valid",
    });
  }

  // Generate JWT token
  const payload = {
    client_id: client.client_id,
    nama: client.nama,
    role: "client",
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET || "secretkey", {
    expiresIn: "2h",
  });
  try {
    const setKey = `login:${client_id}`;
    await redis.sAdd(setKey, token);
    await redis.set(`login_token:${token}`, client_id, { EX: 2 * 60 * 60 });
  } catch (err) {
    console.error('[AUTH] Gagal menyimpan token login:', err.message);
  }
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 2 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production'
  });
  // Kembalikan token dan data client
  return res.json({ success: true, client: payload });
});

export default router;
