import { query } from '../repository/db.js';

export async function upsertPolda(nama) {
  if (!nama) return null;
  const res = await query(
    `INSERT INTO polda (nama) VALUES ($1)
     ON CONFLICT (nama) DO UPDATE SET nama = EXCLUDED.nama
     RETURNING *`,
    [nama]
  );
  return res.rows[0];
}

export async function findAllPolda() {
  const res = await query('SELECT * FROM polda ORDER BY nama');
  return res.rows;
}

export async function upsertKota(polda_id, nama) {
  if (!polda_id || !nama) return null;
  const res = await query(
    `INSERT INTO polda_kota (polda_id, nama)
     VALUES ($1, $2)
     ON CONFLICT (polda_id, nama) DO NOTHING
     RETURNING *`,
    [polda_id, nama]
  );
  return res.rows[0] || null;
}

export async function findAllKota() {
  const res = await query('SELECT * FROM polda_kota');
  return res.rows;
}

export async function findKotaByPolda(polda_id) {
  const res = await query('SELECT * FROM polda_kota WHERE polda_id = $1', [polda_id]);
  return res.rows;
}
