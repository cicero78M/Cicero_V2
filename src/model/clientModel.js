// src/model/clientModel.js

import { pool } from '../config/db.js';

// Ambil semua client
export const findAll = async () => {
  const res = await pool.query('SELECT * FROM clients');
  return res.rows;
};

// Ambil client by client_id
export const findById = async (client_id) => {
  const res = await pool.query('SELECT * FROM clients WHERE client_id = $1', [client_id]);
  return res.rows[0] || null;
};

// Buat client baru
export const create = async (client) => {
  const q = `
    INSERT INTO clients 
      (client_id, nama, client_type, client_status, client_insta, client_insta_status, client_tiktok, client_tiktok_status, client_operator, client_group, tiktok_secuid, client_super)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `;
  const values = [
    client.client_id,
    client.nama,
    client.client_type || '',
    client.client_status ?? true,
    client.client_insta || '',
    client.client_insta_status ?? true,
    client.client_tiktok || '',
    client.client_tiktok_status ?? true,
    client.client_operator || '',
    client.client_group || '',
    client.tiktok_secuid || '',
    client.client_super || ''
  ];
  const res = await pool.query(q, values);
  return res.rows[0];
};

// Update client, bisa update 1 key saja!
export const update = async (client_id, clientData) => {
  const old = await findById(client_id);
  if (!old) return null;
  const merged = { ...old, ...clientData };

  const q = `
    UPDATE clients SET
      nama = $2,
      client_type = $3,
      client_status = $4,
      client_insta = $5,
      client_insta_status = $6,
      client_tiktok = $7,
      client_tiktok_status = $8,
      client_operator = $9,
      client_group = $10,
      tiktok_secuid = $11,
      client_super = $12
    WHERE client_id = $1
    RETURNING *
  `;
  const values = [
    client_id,
    merged.nama,
    merged.client_type,
    merged.client_status,
    merged.client_insta || '',
    merged.client_insta_status,
    merged.client_tiktok || '',
    merged.client_tiktok_status,
    merged.client_operator,
    merged.client_group,
    merged.tiktok_secuid || '',
    merged.client_super || ''
  ];
  const res = await pool.query(q, values);
  return res.rows[0];
};

// Hapus client
export const remove = async (client_id) => {
  const res = await pool.query('DELETE FROM clients WHERE client_id = $1 RETURNING *', [client_id]);
  return res.rows[0] || null;
};

// Ambil semua client aktif IG
export async function findAllActiveWithInstagram() {
  const res = await pool.query(
    `SELECT * FROM clients WHERE client_status = true AND client_insta_status = true`
  );
  return res.rows;
}

// Ambil semua client aktif TikTok
export async function findAllActiveWithTiktok() {
  const res = await pool.query(
    `SELECT * FROM clients WHERE client_status = true AND client_tiktok_status = true`
  );
  return res.rows;
}

// [Opsional] Untuk statistik/rekap dashboard
export async function getAllClients() {
  const res = await pool.query('SELECT * FROM clients');
  return res.rows;
}
export async function updateClientSecUid(client_id, secUid) {
  const res = await pool.query(
    `UPDATE client SET tiktok_secuid = $1 WHERE client_id = $2`,
    [secUid, client_id]
  );
  return res.rowCount > 0;
}

export async function getAllClientIds() {
  const rows = await pool.query("SELECT client_id, nama, client_status FROM clients ORDER BY client_id");
  return rows.rows.map(r => ({
    client_id: r.client_id,
    nama: r.nama,
    status: r.client_status,
  }));
}
