import { pool } from '../config/db.js';

// Dapatkan semua client
export const findAll = async () => {
  const res = await pool.query('SELECT * FROM clients');
  return res.rows;
};

// Dapatkan satu client by client_id
export const findById = async (client_id) => {
  const res = await pool.query('SELECT * FROM clients WHERE client_id = $1', [client_id]);
  return res.rows[0] || null;
};

// Buat client baru
export const create = async (client) => {
  const q = `
    INSERT INTO clients 
      (client_id, nama, client_type, client_status, client_insta, client_insta_status, client_tiktok, client_tiktok_status, client_operator, client_group, tiktok_secUid, client_super)
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
    client.client_super || '',
    client.client_group || '',
    client.tiktok_secUid || ''
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
      client_super = $12,
      client_group = $10,
      tiktok_secUid = $11,
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
    merged.client_super || '',
    merged.client_group,
    merged.tiktok_secUid || '',
  ];
  const res = await pool.query(q, values);
  return res.rows[0];
};




// Hapus client
export const remove = async (client_id) => {
  const res = await pool.query('DELETE FROM clients WHERE client_id = $1 RETURNING *', [client_id]);
  return res.rows[0] || null;
};
