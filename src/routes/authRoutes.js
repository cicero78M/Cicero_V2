import express from "express";
import jwt from "jsonwebtoken";
import { query } from "../db/index.js";
import {
  isAdminWhatsApp,
  formatToWhatsAppId,
  getAdminWAIds,
} from "../utils/waHelper.js";
import redis from "../config/redis.js";
import waClient, { waReady } from "../service/waService.js";
import { insertVisitorLog } from "../model/visitorLogModel.js";

function notifyAdmin(message) {
  if (!waReady) return;
  for (const wa of getAdminWAIds()) {
    waClient.sendMessage(wa, message).catch(() => {});
  }
}

const router = express.Router();

router.post("/login", async (req, res) => {
  const { client_id, client_operator } = req.body;
  // Validasi input
  if (!client_id || !client_operator) {
    const reason = "client_id dan client_operator wajib diisi";
    const time = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
    });
    notifyAdmin(
      `❌ Login gagal\nAlasan: ${reason}\nID: ${client_id || "-"}\nOperator: ${
        client_operator || "-"}\nWaktu: ${time}`
    );
    return res
      .status(400)
      .json({ success: false, message: reason });
  }
  // Cari client berdasarkan ID saja
  const { rows } = await query(
    "SELECT * FROM clients WHERE client_id = $1",
    [client_id]
  );
  const client = rows[0];
  // Jika client tidak ditemukan
  if (!client) {
    const reason = "client_id tidak ditemukan";
    const time = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    notifyAdmin(
      `❌ Login gagal\nAlasan: ${reason}\nID: ${client_id}\nOperator: ${client_operator}\nWaktu: ${time}`
    );
    return res.status(401).json({
      success: false,
      message: `Login gagal: ${reason}`,
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
    const reason = "client operator tidak valid";
    const time = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    notifyAdmin(
      `❌ Login gagal\nAlasan: ${reason}\nID: ${client_id}\nOperator: ${client_operator}\nWaktu: ${time}`
    );
    return res.status(401).json({
      success: false,
      message: `Login gagal: ${reason}`,
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
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  notifyAdmin(
    `\uD83D\uDD11 Login: ${client.nama} (${client.client_id})\nOperator: ${client_operator}\nWaktu: ${time}`
  );
  // Kembalikan token dan data client
  return res.json({ success: true, token, client: payload });
});

router.post('/user-login', async (req, res) => {
  const { nrp, whatsapp } = req.body;
  if (!nrp || !whatsapp) {
    return res
      .status(400)
      .json({ success: false, message: 'nrp dan whatsapp wajib diisi' });
  }
  const { rows } = await query(
    'SELECT user_id, nama FROM "user" WHERE user_id = $1 AND whatsapp = $2',
    [nrp, whatsapp]
  );
  const user = rows[0];
  if (!user) {
    return res
      .status(401)
      .json({ success: false, message: 'Login gagal: data tidak ditemukan' });
  }
  const payload = { user_id: user.user_id, nama: user.nama, role: 'user' };
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'secretkey', {
    expiresIn: '2h'
  });
  try {
    await redis.sAdd(`user_login:${user.user_id}`, token);
    await redis.set(`login_token:${token}`, `user:${user.user_id}`, {
      EX: 2 * 60 * 60
    });
  } catch (err) {
    console.error('[AUTH] Gagal menyimpan token login user:', err.message);
  }
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 2 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production'
  });
  return res.json({ success: true, token, user: payload });
});

router.get('/open', async (req, res) => {
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const ua = req.headers['user-agent'] || '';
  await insertVisitorLog({ ip, userAgent: ua });
  notifyAdmin(
    `\uD83D\uDD0D Web dibuka\nIP: ${ip}\nUA: ${ua}\nWaktu: ${time}`
  );
  return res.json({ success: true });
});


export default router;
