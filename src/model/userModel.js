// src/model/userModel.js

import fs from 'fs/promises';
import { USER_DATA_PATH } from '../utils/constants.js';
import { pool } from '../config/db.js';

const dataPath = USER_DATA_PATH || './src/data/users.json';

// ========== CRUD BERBASIS FILE ==========

const getUsers = async () => {
  try {
    const data = await fs.readFile(dataPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
};

const saveUsers = async (users) => {
  await fs.writeFile(dataPath, JSON.stringify(users, null, 2));
};

export const findAll = async () => await getUsers();

export const findById = async (id) => {
  const users = await getUsers();
  return users.find(u => String(u.id) === String(id)) || null;
};

export const create = async (user) => {
  const users = await getUsers();
  const newUser = { ...user, id: Date.now() };
  users.push(newUser);
  await saveUsers(users);
  return newUser;
};

export const update = async (id, userData) => {
  const users = await getUsers();
  const idx = users.findIndex(u => String(u.id) === String(id));
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...userData };
  await saveUsers(users);
  return users[idx];
};

export const remove = async (id) => {
  const users = await getUsers();
  const idx = users.findIndex(u => String(u.id) === String(id));
  if (idx === -1) return null;
  const deleted = users.splice(idx, 1)[0];
  await saveUsers(users);
  return deleted;
};

// ========== QUERY DATABASE ==========

// Ambil semua user aktif (status = true), tanpa filter insta
export async function getUsersByClient(client_id) {
  const res = await pool.query(
    `SELECT user_id, nama, tiktok, insta, divisi, title, exception
     FROM "user"
     WHERE client_id = $1 AND status = true`,
    [client_id]
  );
  return res.rows;
}

// Ambil semua user aktif (status = true/NULL), khusus absensi TikTok
export async function getUsersByClientFull(client_id) {
  const res = await pool.query(
    `SELECT user_id, nama, tiktok, divisi, title, exception
     FROM "user"
     WHERE client_id = $1 AND (status IS TRUE OR status IS NULL)`,
    [client_id]
  );
  // DEBUG: log hasilnya
  console.log('[DEBUG][getUsersByClientFull] TikTok, client_id:', client_id, '| user:', res.rows.length);
  return res.rows;
}

// [OPSI] Ambil user by Instagram (status = true)
export async function getUsersByClientWithInsta(client_id) {
  const res = await pool.query(
    `SELECT user_id, nama, insta, divisi, title, exception
     FROM "user"
     WHERE client_id = $1 AND status = true AND insta IS NOT NULL`,
    [client_id]
  );
  return res.rows;
}

// [OPSI] Ambil user by TikTok (status = true)
export async function getUsersByClientWithTiktok(client_id) {
  const res = await pool.query(
    `SELECT user_id, nama, tiktok, divisi, title, exception
     FROM "user"
     WHERE client_id = $1 AND status = true AND tiktok IS NOT NULL`,
    [client_id]
  );
  return res.rows;
}

// Ambil seluruh user dari semua client
export async function getAllUsers(client_id) {
  if (client_id) {
    const res = await pool.query(
      'SELECT * FROM "user" WHERE client_id = $1',
      [client_id]
    );
    return res.rows;
  } else {
    // Jika tanpa client_id, ambil semua user di seluruh client
    const res = await pool.query('SELECT * FROM "user"');
    return res.rows;
  }
}
