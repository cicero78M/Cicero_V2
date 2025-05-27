import fs from 'fs/promises';
import path from 'path';
import { pool } from '../config/db.js';
import { decrypt } from '../util/crypt.js'; // Pastikan path ini benar dan menggunakan CryptoJS

// Mapping dari key JSON ke kolom DB
const jsonToDbMap = {
  ID_KEY: 'user_id',
  NAMA: 'nama',
  TITLE: 'title',
  DIVISI: 'divisi',
  JABATAN: 'jabatan',
  STATUS: 'status',
  WHATSAPP: 'whatsapp',
  INSTA: 'insta',
  TIKTOK: 'tiktok',
  EXCEPTION: 'exception'
};

/**
 * Migrasi semua file JSON di user_data/{clientId} ke table user PostgreSQL.
 * Akan mendekripsi setiap field, dan menambah client_id secara otomatis.
 * @param {string} clientId - Misal: 'BOJONEGORO'
 * @returns {Array} List hasil per file
 */
export async function migrateUsersFromFolder(clientId) {
  const userDir = path.resolve('user_data', clientId);
  let results = [];
  try {
    const files = await fs.readdir(userDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(userDir, file);
      const rawContent = await fs.readFile(fullPath, 'utf-8');
      let data;
      try {
        data = JSON.parse(rawContent);

        // Dekripsi & mapping ke user
        const user = {};
        for (const key in jsonToDbMap) {
          if (data[key]) user[jsonToDbMap[key]] = decrypt(data[key]);
        }
        user.client_id = clientId; // Tambahkan client_id (bukan dari JSON, dari argumen)

        // Siapkan SQL
        const columns = Object.keys(user);
        const values = columns.map(col => user[col]);
        const index = columns.map((col, i) => `$${i + 1}`).join(',');
        const update = columns.map(col => `${col}=EXCLUDED.${col}`).join(',');

        await pool.query(
          `INSERT INTO "user" (${columns.join(',')}) VALUES (${index})
           ON CONFLICT (user_id) DO UPDATE SET ${update};`,
          values
        );
        results.push({ file, status: '✅ Sukses' });
      } catch (err) {
        results.push({ file, status: '❌ Gagal', error: err.message });
      }
    }
    return results;
  } catch (err) {
    throw new Error('Gagal membaca folder/folder tidak ditemukan: ' + err.message);
  }
}
