import { pool } from "../config/db.js";

// Ambil user yang SUDAH mengisi Instagram (status true)
export async function getInstaFilledUsersByClient(clientId) {
  const result = await pool.query(
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
  const result = await pool.query(
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
  const result = await pool.query(
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
  const result = await pool.query(
    `SELECT divisi, nama, user_id, title
     FROM "user"
     WHERE client_id = $1 AND (tiktok IS NULL OR tiktok = '') AND status = true
     ORDER BY divisi, nama`,
    [clientId]
  );
  return result.rows;
}

export async function findUserById(user_id) {
  const { rows } = await pool.query('SELECT * FROM "user" WHERE user_id=$1', [
    user_id,
  ]);
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
  const { rows } = await pool.query(
    `UPDATE "user" SET ${field}=$1 WHERE user_id=$2 RETURNING *`,
    [value, user_id]
  );
  return rows[0];
}

// Ambil semua user yang exception = true
export async function getAllExceptionUsers() {
  const { rows } = await pool.query(
    'SELECT * FROM "user" WHERE exception = true'
  );
  return rows;
}

export async function findUserByWhatsApp(wa) {
  if (!wa) return null;
  const result = await pool.query('SELECT * FROM "user" WHERE whatsapp = $1', [
    wa,
  ]);
  return result.rows[0];
}

export async function findUserByInsta(username) {
  if (!username) return null;
  const result = await pool.query('SELECT * FROM "user" WHERE insta = $1', [
    username,
  ]);
  return result.rows[0];
}

export async function findUserByTiktok(username) {
  if (!username) return null;
  // Query string langsung, tidak ada normalisasi
  const result = await pool.query('SELECT * FROM "user" WHERE tiktok = $1', [
    username,
  ]);
  return result.rows[0];
}

// Ambil semua pangkat/title unik (distinct)
export async function getDistinctUserTitles() {
  const { rows } = await pool.query(
    "SELECT DISTINCT title FROM \"user\" WHERE title IS NOT NULL AND title <> '' ORDER BY title"
  );
  return rows.map((r) => r.title);
}

// Ambil semua divisi unik untuk client_id tertentu
export async function getDistinctUserDivisions(client_id) {
  const { rows } = await pool.query(
    "SELECT DISTINCT divisi FROM \"user\" WHERE client_id = $1 AND divisi IS NOT NULL AND divisi <> '' ORDER BY divisi",
    [client_id]
  );
  return rows.map((r) => r.divisi);
}

// Cek duplikat insta/tiktok: query langsung, tidak perlu normalisasi
export async function findUserByField(field, value) {
  const allowed = ["insta", "tiktok"];
  if (!allowed.includes(field))
    throw new Error("Hanya field insta/tiktok yang didukung");
  const { rows } = await pool.query(
    `SELECT user_id FROM "user" WHERE ${field} = $1`,
    [value]
  );
  return rows[0];
}

// Mendapatkan daftar pangkat unik dari tabel user (atau dari tabel/enum khusus jika ada)
export async function getAvailableTitles() {
  // Jika ada table titles: return await pool.query('SELECT DISTINCT title FROM titles');
  const res = await pool.query(
    'SELECT DISTINCT title FROM "user" WHERE title IS NOT NULL ORDER BY title'
  );
  return res.rows.map((r) => r.title).filter(Boolean);
}

// Ambil daftar Satfung unik dari database
export async function getAvailableSatfung() {
  // Gunakan "user" (pakai kutip dua) karena user adalah reserved word di Postgres
  const res = await pool.query(
    'SELECT DISTINCT divisi FROM "user" WHERE divisi IS NOT NULL ORDER BY divisi'
  );
  return res.rows.map((r) => r.divisi).filter(Boolean);
}

// --- Tambahkan fungsi createUser ---
export async function createUser(userData) {
  // Contoh userData: {user_id, nama, title, divisi, jabatan, ...}
  // Sesuaikan dengan struktur dan database-mu!
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
  const res = await pool.query(q, params);
  return res.rows[0];
}
