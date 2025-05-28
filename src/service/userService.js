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
