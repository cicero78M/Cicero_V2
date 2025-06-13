import fs from 'fs/promises';
import path from 'path';
import { pool } from '../config/db.js';
import { decrypt } from '../utils/crypt.js';

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

export async function migrateUsersFromFolder(clientId) {
  const userDir = path.resolve('user_data', clientId);
  const results = [];
  try {
    const files = await fs.readdir(userDir);
    const parsedUsers = [];
    const waCount = {};

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(userDir, file);
      const rawContent = await fs.readFile(fullPath, 'utf-8');

      try {
        const data = JSON.parse(rawContent);

        const user = {};
        for (const key in jsonToDbMap) {
          if (data[key]) {
            let val = decrypt(data[key]);
            if (jsonToDbMap[key] === 'user_id') {
              if (val && val.length < 8) val = val.padStart(8, '0');
            }
            if (['status', 'exception'].includes(jsonToDbMap[key])) {
              if (typeof val === 'string') {
                if (val.trim().toLowerCase() === 'true') val = true;
                else if (val.trim().toLowerCase() === 'false') val = false;
                else val = false;
              } else if (val === true) {
                val = true;
              } else {
                val = false;
              }
            }
            user[jsonToDbMap[key]] = val;
          } else if (['status', 'exception'].includes(jsonToDbMap[key])) {
            user[jsonToDbMap[key]] = false;
          }
        }
        user.client_id = clientId;

        // Hitung kemunculan nomor WhatsApp
        if (user.whatsapp) {
          const wa = String(user.whatsapp).replace(/\D/g, '');
          user.whatsapp = wa;
          waCount[wa] = (waCount[wa] || 0) + 1;
        }

        parsedUsers.push({ file, user });
      } catch (err) {
        results.push({ file, status: '❌ Gagal', error: err.message });
      }
    }

    // Ambil nomor operator client
    let operatorWa = '';
    try {
      const op = await pool.query('SELECT client_operator FROM clients WHERE client_id = $1', [clientId]);
      operatorWa = op.rows[0]?.client_operator || '';
      operatorWa = String(operatorWa).replace(/\D/g, '');
    } catch {}

    // Proses insert dengan filter WhatsApp
    for (const { file, user } of parsedUsers) {
      try {
        const wa = user.whatsapp ? String(user.whatsapp).replace(/\D/g, '') : '';
        if (!wa || wa === operatorWa || waCount[wa] > 1) {
          user.whatsapp = null;
        }

        const columns = Object.keys(user);
        const values = columns.map((col) => user[col]);
        const index = columns.map((col, i) => `$${i + 1}`).join(',');
        const update = columns.map((col) => `${col}=EXCLUDED.${col}`).join(',');

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
