import express from "express";
import jwt from "jsonwebtoken";
import { query } from "../db/index.js";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import * as penmasUserModel from "../model/penmasUserModel.js";
import * as dashboardUserModel from "../model/dashboardUserModel.js";
import * as userModel from "../model/userModel.js";
import {
  isAdminWhatsApp,
  formatToWhatsAppId,
  getAdminWAIds,
  normalizeWhatsappNumber,
  safeSendMessage,
} from "../utils/waHelper.js";
import redis from "../config/redis.js";
import waClient, { waReady } from "../service/waService.js";
import { insertVisitorLog } from "../model/visitorLogModel.js";
import { insertLoginLog } from "../model/loginLogModel.js";

function notifyAdmin(message) {
  if (!waReady) {
    console.warn('[WA] Skipping admin notification: WhatsApp client not ready');
    return;
  }
  for (const wa of getAdminWAIds()) {
    safeSendMessage(waClient, wa, message);
  }
}

const router = express.Router();

router.post('/penmas-register', async (req, res) => {
  const { username, password, role = 'penulis' } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ success: false, message: 'username dan password wajib diisi' });
  }
  const existing = await penmasUserModel.findByUsername(username);
  if (existing) {
    return res
      .status(400)
      .json({ success: false, message: 'username sudah terpakai' });
  }
  const user_id = uuidv4();
  const password_hash = await bcrypt.hash(password, 10);
  const user = await penmasUserModel.createUser({
    user_id,
    username,
    password_hash,
    role,
  });
  return res.status(201).json({ success: true, user_id: user.user_id });
});

router.post('/penmas-login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ success: false, message: 'username dan password wajib diisi' });
  }
  const user = await penmasUserModel.findByUsername(username);
  if (!user) {
    return res
      .status(401)
      .json({ success: false, message: 'Login gagal: data tidak ditemukan' });
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res
      .status(401)
      .json({ success: false, message: 'Login gagal: password salah' });
  }
  const payload = { user_id: user.user_id, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '2h',
  });
  try {
    await redis.sAdd(`penmas_login:${user.user_id}`, token);
    await redis.set(`login_token:${token}`, `penmas:${user.user_id}`, {
      EX: 2 * 60 * 60,
    });
  } catch (err) {
    console.error('[AUTH] Gagal menyimpan token login penmas:', err.message);
  }
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 2 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  });
  await insertLoginLog({
    actorId: user.user_id,
    loginType: 'operator',
    loginSource: 'web'
  });
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  notifyAdmin(
    `\uD83D\uDD11 Login Penmas: ${user.username} (${user.role})\nWaktu: ${time}`
  );
  return res.json({ success: true, token, user: payload });
});

router.post('/dashboard-register', async (req, res) => {
  let { username, password, role_id, role, client_ids, client_id, whatsapp } = req.body;
  const status = false;
  const clientIds = client_ids || (client_id ? [client_id] : []);
  if (!username || !password || !whatsapp) {
    return res
      .status(400)
      .json({ success: false, message: 'username, password, dan whatsapp wajib diisi' });
  }
  const normalizedWhatsapp = normalizeWhatsappNumber(whatsapp);
  if (normalizedWhatsapp.length < 8) {
    return res
      .status(400)
      .json({ success: false, message: 'whatsapp tidak valid' });
  }
  whatsapp = normalizedWhatsapp;
  const existing = await dashboardUserModel.findByUsername(username);
  if (existing) {
    return res
      .status(400)
      .json({ success: false, message: 'username sudah terpakai' });
  }
  const dashboard_user_id = uuidv4();
  const password_hash = await bcrypt.hash(password, 10);

  let roleRow;
  if (role_id) {
    const { rows } = await query('SELECT role_id, role_name FROM roles WHERE role_id = $1', [role_id]);
    roleRow = rows[0];
    if (!roleRow) {
      return res.status(400).json({ success: false, message: 'role_id tidak valid' });
    }
  } else if (role) {
    const { rows } = await query(
      'SELECT role_id, role_name FROM roles WHERE LOWER(role_name) = LOWER($1)',
      [role]
    );
    roleRow = rows[0];
    if (!roleRow) {
      return res.status(400).json({ success: false, message: 'role tidak valid' });
    }
    role_id = roleRow.role_id;
  } else {
    const { rows } = await query(
      'SELECT role_id, role_name FROM roles WHERE LOWER(role_name) = LOWER($1)',
      ['operator']
    );
    roleRow = rows[0];
    if (!roleRow) {
      const inserted = await query(
        'INSERT INTO roles (role_name) VALUES ($1) ON CONFLICT (role_name) DO UPDATE SET role_name=EXCLUDED.role_name RETURNING role_id, role_name',
        ['operator']
      );
      roleRow = inserted.rows[0];
    }
    role_id = roleRow.role_id;
  }

  if (roleRow.role_name === 'operator' && clientIds.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: 'minimal satu client harus dipilih' });
  }

  const user = await dashboardUserModel.createUser({
    dashboard_user_id,
    username,
    password_hash,
    role_id,
    status,
    user_id: null,
    whatsapp,
  });
  if (clientIds.length > 0) {
    await dashboardUserModel.addClients(dashboard_user_id, clientIds);
  }
  notifyAdmin(
    `\uD83D\uDCCB Permintaan User Approval dengan data sebagai berikut :\nUsername: ${username}\nID: ${dashboard_user_id}\nRole: ${roleRow?.role_name || '-'}\nWhatsApp: ${whatsapp}\nClient ID: ${
      clientIds.length ? clientIds.join(', ') : '-'
    }\n\nBalas approvedash#${username} untuk menyetujui atau denydash#${username} untuk menolak.`
  );
  if (waReady && whatsapp) {
    const wid = formatToWhatsAppId(whatsapp);
    safeSendMessage(
      waClient,
      wid,
      "\uD83D\uDCCB Permintaan registrasi dashboard Anda telah diterima dan menunggu persetujuan admin."
    );
  } else if (!waReady && whatsapp) {
    console.warn(
      `[WA] Skipping user notification for ${whatsapp}: WhatsApp client not ready`
    );
  }
  return res
    .status(201)
    .json({ success: true, dashboard_user_id: user.dashboard_user_id, status: user.status });
});

router.post('/dashboard-login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ success: false, message: 'username dan password wajib diisi' });
  }
  const user = await dashboardUserModel.findByUsername(username);
  if (!user) {
    return res
      .status(401)
      .json({ success: false, message: 'Login gagal: data tidak ditemukan' });
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res
      .status(401)
      .json({ success: false, message: 'Login gagal: password salah' });
  }
  if (!user.status) {
    return res
      .status(403)
      .json({ success: false, message: 'Akun belum disetujui' });
  }
  if (!user.client_ids || user.client_ids.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: 'Operator belum memiliki klien yang diizinkan' });
  }
  let roleName = user.role;
  if (user.client_ids.length === 1) {
    const { rows } = await query('SELECT client_type FROM clients WHERE client_id = $1', [user.client_ids[0]]);
    if (rows[0]?.client_type?.toLowerCase() === 'direktorat') {
      roleName = user.client_ids[0].toLowerCase();
    }
  }
  const payload = {
    dashboard_user_id: user.dashboard_user_id,
    user_id: user.user_id,
    role: roleName,
    role_id: user.role_id,
    client_ids: user.client_ids
  };
  if (user.client_ids.length === 1) {
    payload.client_id = user.client_ids[0];
  }
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '2h',
  });
  try {
    await redis.sAdd(`dashboard_login:${user.dashboard_user_id}`, token);
    await redis.set(`login_token:${token}`, `dashboard:${user.dashboard_user_id}`, {
      EX: 2 * 60 * 60,
    });
  } catch (err) {
    console.error('[AUTH] Gagal menyimpan token login dashboard:', err.message);
  }
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 2 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  });
  await insertLoginLog({
    actorId: user.dashboard_user_id,
    loginType: 'operator',
    loginSource: 'web'
  });
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  notifyAdmin(
    `\uD83D\uDD11 Login dashboard: ${user.username} (${user.role})\nWaktu: ${time}`
  );
  return res.json({ success: true, token, user: payload });
});

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
  const role =
    client.client_type?.toLowerCase() === "direktorat"
      ? client.client_id.toLowerCase()
      : "client";
  const payload = {
    client_id: client.client_id,
    nama: client.nama,
    role,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
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
  await insertLoginLog({
    actorId: client.client_id,
    loginType: 'operator',
    loginSource: 'mobile'
  });
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  notifyAdmin(
    `\uD83D\uDD11 Login: ${client.nama} (${client.client_id})\nOperator: ${client_operator}\nWaktu: ${time}`
  );
  // Kembalikan token dan data client
  return res.json({ success: true, token, client: payload });
});

router.post('/user-register', async (req, res) => {
  const { nrp, nama, client_id, whatsapp = '', divisi = '', jabatan = '', title = '' } = req.body;
  if (!nrp || !nama || !client_id) {
    return res
      .status(400)
      .json({ success: false, message: 'nrp, nama, dan client_id wajib diisi' });
  }
  const existing = await query('SELECT * FROM "user" WHERE user_id = $1', [nrp]);
  if (existing.rows.length) {
    return res
      .status(400)
      .json({ success: false, message: 'nrp sudah terdaftar' });
  }
  const user = await userModel.createUser({
    user_id: nrp,
    nama,
    client_id,
    whatsapp,
    divisi,
    jabatan,
    title
  });
  return res.status(201).json({ success: true, user_id: user.user_id });
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
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
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
  await insertLoginLog({
    actorId: user.user_id,
    loginType: 'user',
    loginSource: 'mobile'
  });
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  notifyAdmin(
    `\uD83D\uDD11 Login user: ${user.user_id} - ${user.nama}\nWaktu: ${time}`
  );
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
