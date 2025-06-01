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
  // 1. Cek DB lebih dulu (by client_id)
  if (client_id) {
    const client = await findById(client_id);
    // PATCH: gunakan field tiktok_secuid dari DB (lowercase)
    if (client && client.tiktok_secuid) {
      console.log(`[INFO] Ambil secUid dari DB: ${client.tiktok_secuid}`);
      return client.tiktok_secuid;
    }
    // Fallback: username dari field client_tiktok jika tidak di-parameter
    if (!username && client && client.client_tiktok) {
      username = String(client.client_tiktok).replace(/^@/, '').trim();
    }
  }
  // PATCH: Error handling jika username kosong
  if (!username) {
    throw new Error("Username TikTok kosong. Harap lengkapi data client_tiktok pada client.");
  }

  // 2. Fetch via API jika secUid belum ada di DB
  const url = `https://${RAPIDAPI_HOST}/api/user/info?uniqueId=${encodeURIComponent(username)}`;
  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  };
  try {
    console.log(`[INFO] Ambil secUid dari API untuk username: ${username}`);
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
      await update(client_id, { tiktok_secuid: secUid }); // field harus tiktok_secuid (LOWERCASE)
    }
    return secUid;
  } catch (err) {
    throw new Error("Gagal ambil secUid TikTok: " + err.message);
  }
}
