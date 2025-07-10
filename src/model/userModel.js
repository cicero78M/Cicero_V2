// src/model/userModel.js

import { query } from '../repository/db.js';

// Helper to normalize text fields to uppercase
function normalizeUserFields(data) {
  if (!data) return;
  const fields = ['nama', 'title', 'divisi', 'jabatan'];
  for (const key of fields) {
    if (data[key] && typeof data[key] === 'string') {
      data[key] = data[key].toUpperCase();
    }
  }
}

// ========== QUERY DATABASE ==========

// Ambil semua user aktif (status = true), tanpa filter insta
export async function getUsersByClient(client_id) {
  const res = await query(
    `SELECT user_id, nama, tiktok, insta, divisi, title, status, exception
     FROM "user"
     WHERE client_id = $1 AND status = true`,
    [client_id]
  );
  return res.rows;
}

// Ambil semua user aktif (status = true/NULL), khusus absensi TikTok
export async function getUsersByClientFull(client_id) {
  const res = await query(
    `SELECT user_id, nama, tiktok, divisi, title, exception
     FROM "user"
     WHERE client_id = $1 AND (status IS TRUE OR status IS NULL)`,
    [client_id]
  );
  // DEBUG: log hasilnya
  console.log('[DEBUG][getUsersByClientFull] TikTok, client_id:', client_id, '| user:', res.rows.length);
  return res.rows;
}

// [OPSI] Ambil user by Instagram (status = true)

// Ambil seluruh user dari semua client
export async function getAllUsers(client_id) {
  if (client_id) {
    const res = await query(
      'SELECT * FROM "user" WHERE client_id = $1',
      [client_id]
    );
    return res.rows;
  } else {
    // Jika tanpa client_id, ambil semua user di seluruh client
    const res = await query('SELECT * FROM "user"');
    return res.rows;
  }
}

// Ambil user yang SUDAH mengisi Instagram (status true)
export async function getInstaFilledUsersByClient(clientId) {
  const result = await query(
    `SELECT divisi, nama, user_id, title, insta
     FROM "user"
     WHERE client_id = $1 AND insta IS NOT NULL AND insta <> '' AND status = true
     ORDER BY divisi, nama`,
    [clientId]
  );
  return result.rows;
}

// Ambil user yang BELUM mengisi Instagram (status true)
export async function getInstaEmptyUsersByClient(clientId) {
  const result = await query(
    `SELECT divisi, nama, user_id, title
     FROM "user"
     WHERE client_id = $1 AND (insta IS NULL OR insta = '') AND status = true
     ORDER BY divisi, nama`,
    [clientId]
  );
  return result.rows;
}

// Ambil user yang SUDAH mengisi TikTok (status true)
export async function getTiktokFilledUsersByClient(clientId) {
  const result = await query(
    `SELECT divisi, nama, user_id, title, tiktok
     FROM "user"
     WHERE client_id = $1 AND tiktok IS NOT NULL AND tiktok <> '' AND status = true
     ORDER BY divisi, nama`,
    [clientId]
  );
  return result.rows;
}

// Ambil user yang BELUM mengisi TikTok (status true)
export async function getTiktokEmptyUsersByClient(clientId) {
  const result = await query(
    `SELECT divisi, nama, user_id, title
     FROM "user"
     WHERE client_id = $1 AND (tiktok IS NULL OR tiktok = '') AND status = true
     ORDER BY divisi, nama`,
    [clientId]
  );
  return result.rows;
}

export async function findUserById(user_id) {
  const { rows } = await query('SELECT * FROM "user" WHERE user_id=$1', [
    user_id,
  ]);
  return rows[0];
}

// Ambil user berdasarkan user_id dan client_id
export async function findUserByIdAndClient(user_id, client_id) {
  const { rows } = await query(
    'SELECT * FROM "user" WHERE user_id=$1 AND client_id=$2',
    [user_id, client_id]
  );
  return rows[0];
}

/**
 * Update field user (termasuk insta/tiktok/whatsapp/exception/status/nama/title/divisi/jabatan)
 */
export async function updateUserField(user_id, field, value) {
  const allowed = [
    "insta",
    "tiktok",
    "whatsapp",
    "exception",
    "status",
    "nama",
    "title",
    "divisi",
    "jabatan",
  ];
  if (!allowed.includes(field)) throw new Error("Field tidak diizinkan!");
  if (["nama", "title", "divisi", "jabatan"].includes(field) && typeof value === 'string') {
    value = value.toUpperCase();
  }
  const { rows } = await query(
    `UPDATE "user" SET ${field}=$1 WHERE user_id=$2 RETURNING *`,
    [value, user_id]
  );
  return rows[0];
}

// Ambil user dengan exception per client
export async function getExceptionUsersByClient(client_id) {
  const { rows } = await query(
    'SELECT * FROM "user" WHERE exception = true AND client_id = $1',
    [client_id]
  );
  return rows;
}

export async function findUserByWhatsApp(wa) {
  if (!wa) return null;
  const result = await query('SELECT * FROM "user" WHERE whatsapp = $1', [
    wa,
  ]);
  return result.rows[0];
}

export async function findUserByIdAndWhatsApp(userId, wa) {
  if (!userId || !wa) return null;
  const { rows } = await query(
    'SELECT * FROM "user" WHERE user_id = $1 AND whatsapp = $2',
    [userId, wa]
  );
  return rows[0];
}

// Ambil semua pangkat/title unik (distinct)

// Mendapatkan daftar pangkat unik dari tabel user (atau dari tabel/enum khusus jika ada)
export async function getAvailableTitles() {
  // Jika ada table titles: return await query('SELECT DISTINCT title FROM titles');
  const res = await query(
    'SELECT DISTINCT title FROM "user" WHERE title IS NOT NULL ORDER BY title'
  );
  return res.rows.map((r) => r.title).filter(Boolean);
}

// Ambil daftar Satfung unik dari database
export async function getAvailableSatfung() {
  // Gunakan "user" (pakai kutip dua) karena user adalah reserved word di Postgres
  const res = await query(
    'SELECT DISTINCT divisi FROM "user" WHERE divisi IS NOT NULL ORDER BY divisi'
  );
  return res.rows.map((r) => r.divisi).filter(Boolean);
}

// --- Tambahkan fungsi createUser ---
export async function createUser(userData) {
  // Contoh userData: {user_id, nama, title, divisi, jabatan, ...}
  // Sesuaikan dengan struktur dan database-mu!
  normalizeUserFields(userData);
  const q = `
    INSERT INTO "user" (user_id, nama, title, divisi, jabatan, status, whatsapp, insta, tiktok, client_id, exception)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *;
  `;
  const params = [
    userData.user_id,
    userData.nama,
    userData.title,
    userData.divisi,
    userData.jabatan,
    userData.status ?? true, // default true
    userData.whatsapp || "",
    userData.insta || "",
    userData.tiktok || "",
    userData.client_id || null,
    userData.exception ?? false
  ];
  const res = await query(q, params);
  return res.rows[0];
}

export async function updateUser(userId, userData) {
  normalizeUserFields(userData);
  const columns = Object.keys(userData);
  if (columns.length === 0) return null;
  const setClause = columns.map((c, i) => `${c}=$${i + 1}`).join(', ');
  const params = columns.map((c) => userData[c]);
  params.push(userId);
  const { rows } = await query(
    `UPDATE "user" SET ${setClause} WHERE user_id=$${columns.length + 1} RETURNING *`,
    params
  );
  return rows[0];
}

export async function deleteUser(userId) {
  const { rows } = await query(
    'DELETE FROM "user" WHERE user_id=$1 RETURNING *',
    [userId]
  );
  return rows[0];
}

// Hapus field WhatsApp untuk semua user yang nomornya terdapat pada adminWAList
export async function clearUsersWithAdminWA(adminWAList) {
  if (!adminWAList || adminWAList.length === 0) return [];
  const { rows } = await query(
    "UPDATE \"user\" SET whatsapp = '' WHERE whatsapp = ANY($1::text[]) RETURNING user_id",
    [adminWAList]
  );
  return rows;
}

// --- Alias for backward compatibility ---
export const findUsersByClientId = getUsersByClient;
export const findUserByWA = findUserByWhatsApp;
