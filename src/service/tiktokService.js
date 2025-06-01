import fetch from 'node-fetch'; // npm install node-fetch
import { findById, update } from '../model/clientModel.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "tiktok-api23.p.rapidapi.com";

/**
 * Ambil secUid TikTok (DB-first, fallback ke API jika kosong).
 * @param {string} client_id 
 * @param {string} username (tanpa '@', optional)
 * @returns {string|null} secUid TikTok
 */
export async function getTiktokSecUid(client_id, username) {
  // 1. Cek DB
  if (client_id) {
    const client = await findById(client_id);
    if (client && client.tiktok_secUid) {
      return client.tiktok_secUid;
    }
    // Fallback: username dari client jika kosong di parameter
    if (!username && client && client.client_tiktok) {
      username = client.client_tiktok.replace(/^@/, '');
    }
  }
  if (!username) throw new Error("Username TikTok kosong.");
  // 2. Fetch via API
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

    // 3. Update ke DB jika client_id tersedia
    if (client_id && secUid) {
      await update(client_id, { tiktok_secUid: secUid });
    }
    return secUid;
  } catch (err) {
    throw new Error("Gagal ambil secUid TikTok: " + err.message);
  }
}
