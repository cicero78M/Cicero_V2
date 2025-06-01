import fetch from 'node-fetch'; // npm install node-fetch
import { findClientById, updateClient } from '../model/clientModel.js';
// Jika secUid juga disimpan di tabel user, import model user dan update logika sesuai kebutuhan

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "tiktok-api23.p.rapidapi.com";

/**
 * Ambil secUid TikTok:
 * 1. Cek di database (client.tiktok_secUid)
 * 2. Jika kosong/null, fetch via API, lalu simpan ke DB
 * @param {string} client_id 
 * @param {string} username (username TikTok tanpa '@')
 * @returns {string|null} secUid TikTok
 */
export async function getTiktokSecUid(client_id, username) {
  // 1. Cek DB
  if (client_id) {
    const client = await findClientById(client_id);
    if (client && client.tiktok_secUid) {
      return client.tiktok_secUid;
    }
    // Fallback: username dari client jika kosong di parameter
    if (!username && client && client.client_tiktok) {
      username = client.client_tiktok.replace(/^@/, '');
    }
  }
  // 2. Pastikan username tersedia
  if (!username) throw new Error("Username TikTok kosong.");
  // 3. Fetch via API
  const url = `https://${RAPIDAPI_HOST}/api/user/info?uniqueId=${encodeURIComponent(username)}`;
  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  };
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error: ${response.status}.\nDetail: ${errText}`);
    }
    const data = await response.json();
    const secUid = data?.userInfo?.user?.secUid;
    if (!secUid) throw new Error("secUid tidak ditemukan di response API.");

    // 4. Update ke DB jika client_id tersedia
    if (client_id && secUid) {
      await updateClient(client_id, { tiktok_secUid: secUid });
    }
    return secUid;
  } catch (err) {
    throw new Error("Gagal ambil secUid TikTok: " + err.message);
  }
}
