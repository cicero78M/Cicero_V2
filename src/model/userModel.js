import fs from 'fs/promises';
import { USER_DATA_PATH } from '../utils/constants.js';

const dataPath = USER_DATA_PATH || './src/data/users.json';

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


export async function getUsersByClient(client_id) {
  // Pastikan nama tabel dan field sesuai di database!
  const res = await pool.query(
    `SELECT user_id, nama, insta FROM users WHERE client_id = $1 AND insta IS NOT NULL AND insta != ''`,
    [client_id]
  );
  return res.rows;
}