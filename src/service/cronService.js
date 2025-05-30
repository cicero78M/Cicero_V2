// src/service/cronService.js

import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

// === CRON IG ===
import { fetchAndStoreInstaContent } from './instaFetchService.js';
import { getUsersByClient } from '../model/userModel.js';
import { getShortcodesTodayByClient } from '../model/instaPostModel.js';
import { getLikesByShortcode } from '../model/instaLikeModel.js';

// === CRON TIKTOK ===
import { fetchAndStoreTiktokContent, fetchCommentsTodayByClient } from './tiktokFetchService.js'; // PATCH: tambah import
import { getPostsTodayByClient } from '../model/tiktokPostModel.js';
import { getUsersByClientFull } from '../model/userModel.js';
import { getCommentsByVideoId } from '../model/tiktokCommentModel.js';

import { pool } from '../config/db.js';
import waClient from './waService.js';

const hariIndo = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || '')
  .split(',')
  .map(n => n.trim())
  .filter(Boolean);

function getAdminWAIds() {
  return ADMIN_WHATSAPP.map(n =>
    n.endsWith('@c.us') ? n : n.replace(/[^0-9]/g, '') + '@c.us'
  );
}

function groupByDivision(users) {
  const divGroups = {};
  users.forEach(u => {
    const div = u.divisi || '-';
    if (!divGroups[div]) divGroups[div] = [];
    divGroups[div].push(u);
  });
  return divGroups;
}
function formatName(u) {
  return `${u.title ? u.title + " " : ""}${u.nama}${u.tiktok ? ` : ${u.tiktok}` : ""}${u.insta ? ` : ${u.insta}` : ""}`;
}

// ...fungsi absensiLikesAkumulasiBelum dan absensiKomentarAkumulasiBelum tetap seperti semula...

// === CRON IG: Likes ===
cron.schedule('18 6-22 * * *', async () => {
  console.log('[CRON IG] Mulai tugas fetchInsta & absensiLikes akumulasi belum...');
  try {
    const clients = await getActiveClientsIG();
    const keys = ["code","caption","like_count","taken_at","comment_count"];
    await fetchAndStoreInstaContent(keys);

    for (const client of clients) {
      const msg = await absensiLikesAkumulasiBelum(client.client_id);
      if (msg && msg.length > 0) {
        for (const admin of getAdminWAIds()) {
          try {
            await waClient.sendMessage(admin, msg);
            console.log(`[CRON IG] Sent absensi IG client=${client.client_id} to ${admin}`);
          } catch (waErr) {
            console.error(`[CRON IG ERROR] send WA to ${admin}:`, waErr.message);
          }
        }
      }
    }
    console.log('[CRON IG] Laporan absensi likes berhasil dikirim ke admin.');
  } catch (err) {
    console.error('[CRON IG ERROR]', err);
    for (const admin of getAdminWAIds()) {
      try {
        await waClient.sendMessage(admin, `[CRON IG ERROR] ${err.message || err}`);
      } catch (waErr) {
        console.error(`[CRON IG ERROR] Gagal kirim error ke ${admin}:`, waErr.message);
      }
    }
  }
}, {
  timezone: 'Asia/Jakarta'
});

// === CRON TikTok: Komentar ===
cron.schedule('19 6-22 * * *', async () => {
  console.log('[CRON TIKTOK] Mulai tugas fetchTiktok & absensiKomentar akumulasi belum...');
  try {
    const clients = await getActiveClientsTiktok();
    await fetchAndStoreTiktokContent();

    // PATCH: fetch komentar untuk semua konten hari ini (update tiktok_comment)
    for (const client of clients) {
      try {
        const commentRes = await fetchCommentsTodayByClient(client.client_id);
        console.log(
          `[CRON TIKTOK][${client.client_id}] Fetched komentar hari ini: ` +
          `total=${commentRes.total}, sukses=${commentRes.totalFetched}, gagal=${commentRes.failed}`
        );
      } catch (e) {
        console.warn(`[CRON TIKTOK][${client.client_id}] Gagal fetch komentar hari ini: ${e.message}`);
      }
    }

    for (const client of clients) {
      let msg = await absensiKomentarAkumulasiBelum(client.client_id);

      // Patch fallback: jika post kosong, kasih notifikasi ke admin dan tetap kirim report absensi DB
      if (msg.trim().toLowerCase().includes('tidak ada konten tiktok')) {
        console.log(`[CRON TIKTOK] Tidak ada post TikTok di DB untuk client: ${client.client_id} hari ini`);
      }

      if (msg && msg.length > 0) {
        for (const admin of getAdminWAIds()) {
          try {
            await waClient.sendMessage(admin, msg);
            console.log(`[CRON TIKTOK] Sent absensi TikTok client=${client.client_id} to ${admin}`);
          } catch (waErr) {
            console.error(`[CRON TIKTOK ERROR] send WA to ${admin}:`, waErr.message);
          }
        }
      }
    }
    console.log('[CRON TIKTOK] Laporan absensi komentar berhasil dikirim ke admin.');
  } catch (err) {
    console.error('[CRON TIKTOK ERROR]', err);
    for (const admin of getAdminWAIds()) {
      try {
        await waClient.sendMessage(admin, `[CRON TIKTOK ERROR] ${err.message || err}`);
      } catch (waErr) {
        console.error(`[CRON TIKTOK ERROR] Gagal kirim error ke ${admin}:`, waErr.message);
      }
    }
  }
}, {
  timezone: 'Asia/Jakarta'
});
