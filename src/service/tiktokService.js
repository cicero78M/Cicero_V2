// src/service/tiktokService.js

import fetch from 'node-fetch'; // npm install node-fetch
import { findById, update } from '../model/clientModel.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "tiktok-api23.p.rapidapi.com";

/**
 * Ambil secUid TikTok (utamakan dari DB, fallback ke API jika tidak ada).
 * @param {string} client_id - client_id dari database clients
 * @param {string} [username] - username TikTok (tanpa '@'), opsional
 * @returns {Promise<string>} secUid TikTok
 */
export async function getTiktokSecUid(client_id, username) {
  // 1. Coba ambil dari DB dulu
  if (client_id) {
    const client = await findById(client_id);
    // Field di DB: tiktok_secuid (LOWERCASE, sesuai schema)
    if (client && client.tiktok_secuid) {
      console.log(`[INFO] Ambil secUid dari DB: ${client.tiktok_secuid}`);
      return client.tiktok_secuid;
    }
    // Jika username tidak diberikan, ambil dari DB field client_tiktok
    if (!username && client && client.client_tiktok) {
      username = String(client.client_tiktok).replace(/^@/, '').trim();
    }
  }

  // 2. Pastikan ada username TikTok
  if (!username) {
    throw new Error("Username TikTok kosong. Harap lengkapi data client_tiktok pada client.");
  }

  // 3. Fallback: Fetch dari API jika DB kosong
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

    // Simpan/update ke DB (field tiktok_secuid, lowercase!)
    if (client_id && secUid) {
      await update(client_id, { tiktok_secuid: secUid });
    }
    return secUid;
  } catch (err) {
    throw new Error("Gagal ambil secUid TikTok: " + err.message);
  }
}
