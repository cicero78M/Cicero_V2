import { query } from '../repository/db.js';

export async function createRegistration(data) {
  const res = await query(
    `INSERT INTO subscription_registration (
        username, nama_rekening, nomor_rekening, phone, amount,
        status, reviewed_at, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, NOW()))
     RETURNING *`,
    [
      data.username,
      data.nama_rekening || null,
      data.nomor_rekening || null,
      data.phone || null,
      data.amount || null,
      data.status || 'pending',
      data.reviewed_at || null,
      data.created_at || null,
    ],
  );
  return res.rows[0];
}

export async function getRegistrations() {
  const res = await query(
    'SELECT * FROM subscription_registration ORDER BY created_at DESC',
  );
  return res.rows;
}

export async function findRegistrationById(id) {
  const res = await query(
    'SELECT * FROM subscription_registration WHERE registration_id=$1',
    [id],
  );
  return res.rows[0] || null;
}

export async function findPendingByUsername(userId) {
  const res = await query(
    `SELECT * FROM subscription_registration
     WHERE username=$1 AND status='pending'
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return res.rows[0] || null;
}

export async function updateRegistration(id, data) {
  const old = await findRegistrationById(id);
  if (!old) return null;
  const merged = { ...old, ...data };
  const res = await query(
    `UPDATE subscription_registration SET
      username=$2,
      nama_rekening=$3,
      nomor_rekening=$4,
      phone=$5,
      amount=$6,
      status=$7,
      reviewed_at=$8
     WHERE registration_id=$1 RETURNING *`,
    [
      id,
      merged.username,
      merged.nama_rekening || null,
      merged.nomor_rekening || null,
      merged.phone || null,
      merged.amount || null,
      merged.status || 'pending',
      merged.reviewed_at || null,
    ],
  );
  return res.rows[0];
}

export async function deleteRegistration(id) {
  const res = await query(
    'DELETE FROM subscription_registration WHERE registration_id=$1 RETURNING *',
    [id],
  );
  return res.rows[0] || null;
}
