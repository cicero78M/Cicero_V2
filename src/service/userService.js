import { pool } from '../config/db.js';
import * as userModel from '../model/userModel.js';

export async function getInstaFilledUsersByClient(clientId) {
  const result = await pool.query(
    `SELECT divisi, nama, user_id, title, insta
     FROM "user"
     WHERE client_id = $1 AND insta IS NOT NULL AND insta <> ''
     ORDER BY divisi, nama`,
    [clientId]
  );
  return result.rows;
}


export const findAllUsers = async () => await userModel.findAll();

export const findUserById = async (id) => await userModel.findById(id);

export const createUser = async (data) => await userModel.create(data);

export const updateUser = async (id, data) => await userModel.update(id, data);

export const deleteUser = async (id) => await userModel.remove(id);
