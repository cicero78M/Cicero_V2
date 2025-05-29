import * as clientModel from '../model/clientModel.js';
// src/service/clientService.js
import axios from 'axios';
import { pool } from '../config/db.js';

export const findAllClients = async () => await clientModel.findAll();

export const findClientById = async (client_id) => await clientModel.findById(client_id);

export const createClient = async (data) => await clientModel.create(data);

export const updateClient = async (client_id, data) => await clientModel.update(client_id, data);

export const deleteClient = async (client_id) => await clientModel.remove(client_id);


const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';

export async function fetchTiktokSecUid(username) {
  if (!username) return null;
  try {
    const res = await axios.get(`https://${RAPIDAPI_HOST}/api/user/info`, {
      params: { unique_id: username },
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    });
    return res.data?.data?.user?.secUid || null;
  } catch {
    return null;
  }
}
export async function updateClientSecUid(client_id, secUid) {
  const res = await pool.query(
    `UPDATE client SET tiktok_secuid = $1 WHERE client_id = $2`,
    [secUid, client_id]
  );
  return res.rowCount > 0;
}
