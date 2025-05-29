import { pool } from '../config/db.js';

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

// Ambil user yang BELUM mengisi insta, status harus true
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

// Ambil user yang SUDAH mengisi tiktok (status true)
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

// Ambil user yang BELUM mengisi tiktok (status true)
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
  const { rows } = await pool.query('SELECT * FROM "user" WHERE user_id=$1', [user_id]);
  return rows[0];
}

export async function updateUserField(user_id, field, value) {
  const allowed = ['insta', 'tiktok', 'whatsapp'];
  if (!allowed.includes(field)) throw new Error('Hanya field insta/tiktok/whatsapp yang bisa diupdate');
  const { rows } = await pool.query(
    `UPDATE "user" SET ${field}=$1 WHERE user_id=$2 RETURNING *`,
    [value, user_id]
  );
  return rows[0];
}

export async function findUserByWhatsApp(wa) {
  if (!wa) return null;
  const result = await pool.query('SELECT * FROM "user" WHERE whatsapp = $1', [wa]);
  return result.rows[0];
}

export async function findUserByInsta(username) {
  if (!username) return null;
  const result = await pool.query('SELECT * FROM "user" WHERE insta = $1', [username]);
  return result.rows[0];
}

export async function findUserByTiktok(username) {
  if (!username) return null;
  const result = await pool.query('SELECT * FROM "user" WHERE tiktok = $1', [username]);
  return result.rows[0];
}

// Ambil semua pangkat/title unik (distinct)
export async function getDistinctUserTitles() {
  const { rows } = await pool.query('SELECT DISTINCT title FROM "user" WHERE title IS NOT NULL AND title <> \'\' ORDER BY title');
  return rows.map(r => r.title);
}

// Ambil semua divisi unik untuk client_id tertentu
export async function getDistinctUserDivisions(client_id) {
  const { rows } = await pool.query('SELECT DISTINCT divisi FROM "user" WHERE client_id = $1 AND divisi IS NOT NULL AND divisi <> \'\' ORDER BY divisi', [client_id]);
  return rows.map(r => r.divisi);
}

// Cek duplikat insta/tiktok
export async function findUserByField(field, value) {
  const { rows } = await pool.query(`SELECT user_id FROM "user" WHERE ${field} = $1`, [value]);
  return rows[0];
}

export async function getUsersByClient(client_id) {
  // Pastikan nama tabel dan field sesuai di database!
  const res = await pool.query(
    `SELECT user_id, nama, insta FROM users WHERE client_id = $1 AND insta IS NOT NULL AND insta != ''`,
    [client_id]
  );
  return res.rows;
}
