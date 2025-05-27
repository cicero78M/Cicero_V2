import fs from 'fs/promises';
import path from 'path';
import { pool } from '../config/db.js';
import { decrypt } from '../utils/crypt.js'; // Pastikan pakai versi CryptoJS + passphrase

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
 * Field boolean 'status' dan 'exception' diisi false jika kosong/null.
 * 'user_id' selalu 8 karakter (pad nol di depan jika perlu).
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

        // Dekripsi & mapping ke user, padding ID, handle boolean
        const user = {};
        for (const key in jsonToDbMap) {
          if (data[key]) {
            let val = decrypt(data[key]);
            // Padding ID_KEY ke 8 karakter
            if (jsonToDbMap[key] === 'user_id') {
              if (val && val.length < 8) val = val.padStart(8, '0');
            }
            // Handle boolean: status, exception
            if (['status', 'exception'].includes(jsonToDbMap[key])) {
              if (!val || val === '') val = false;
              else val = (val === true || val === 'true');
            }
            user[jsonToDbMap[key]] = val;
          } else {
            // Jika tidak ada, isi false untuk boolean
            if (['status', 'exception'].includes(jsonToDbMap[key])) {
              user[jsonToDbMap[key]] = false;
            }
          }
        }
        user.client_id = clientId; // Tambahkan client_id dari argumen

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
