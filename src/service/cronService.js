// src/service/cronService.js

import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

// IG: SERVICE & MODEL
import { fetchAndStoreInstaContent } from './instaFetchService.js';
import { getUsersByClient } from '../model/userModel.js';
import { getShortcodesTodayByClient } from '../model/instaPostModel.js';
import { getLikesByShortcode } from '../model/instaLikeModel.js';

// TIKTOK: SERVICE & MODEL
import { fetchAndStoreTiktokContent } from './tiktokFetchService.js';
import { getPostsTodayByClient } from '../model/tiktokPostModel.js';
import { getCommentsByVideoId } from '../model/tiktokCommentModel.js';

// DB + WA
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

// IG: Get active clients for IG
async function getActiveIGClients() {
  const res = await pool.query(
    `SELECT client_id, client_insta FROM clients WHERE client_status = true AND client_insta_status = true AND client_insta IS NOT NULL`
  );
  return res.rows;
}

// TikTok: Get active clients for TikTok
async function getActiveTiktokClients() {
  const res = await pool.query(
    `SELECT client_id, client_tiktok FROM clients WHERE client_status = true AND client_tiktok_status = true AND client_tiktok IS NOT NULL`
  );
  return res.rows;
}

// IG: Absensi likes akumulasi belum
async function absensiLikesAkumulasiBelum(client_id) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });

  const users = await getUsersByClient(client_id);
  const shortcodes = await getShortcodesTodayByClient(client_id);

  if (!shortcodes.length) return `Tidak ada konten IG untuk *Client*: *${client_id}* hari ini.`;

  const userStats = {};
  users.forEach(u => { userStats[u.user_id] = { ...u, count: 0 }; });

  for (const shortcode of shortcodes) {
    const likes = await getLikesByShortcode(shortcode);
    const likesSet = new Set((likes || []).map(x => (x || '').toLowerCase()));
    users.forEach(u => {
      if (u.insta && u.insta.trim() !== '' && likesSet.has(u.insta.toLowerCase())) {
        userStats[u.user_id].count += 1;
      }
    });
  }

  const totalKonten = shortcodes.length;
  const belumPerDivisi = {};
  let totalUser = Object.values(userStats).length;
  let totalBelum = 0;

  Object.values(userStats).forEach(u => {
    const divisi = u.divisi || '-';
    const titleNama = [u.title, u.nama].filter(Boolean).join(' ');
    const label = u.insta && u.insta.trim() !== ''
      ? `${titleNama} : ${u.insta} (${u.count} konten)`
      : `${titleNama} : belum mengisi data insta (${u.count} konten)`;
    if (!u.insta || u.insta.trim() === '' || u.count < Math.ceil(totalKonten / 2)) {
      if (!belumPerDivisi[divisi]) belumPerDivisi[divisi] = [];
      belumPerDivisi[divisi].push(label);
      totalBelum++;
    }
  });

  const kontenLinks = shortcodes.map(sc => `https://www.instagram.com/p/${sc}`);

  let msg =
    `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar dan Likes pada Akun Official :\n\n` +
    `📋 Rekap Akumulasi Likes IG\n*Client*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\nKonten hari ini: ${totalKonten}\n` +
    `Daftar link konten hari ini:\n${kontenLinks.join('\n')}\n\n` +
    `👤 Jumlah user: *${totalUser}*\n❌ Belum melaksanakan: *${totalBelum}*\n\n`;

  Object.keys(belumPerDivisi).forEach(divisi => {
    const arr = belumPerDivisi[divisi];
    msg += `*${divisi}* (${arr.length} user):\n`;
    arr.forEach(line => { msg += `- ${line}\n`; });
    msg += '\n';
  });

  return msg.trim();
}

// TikTok: Absensi komentar akumulasi belum
async function absensiTiktokKomentarAkumulasiBelum(client_id) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });

  // Model TikTok harus support getUsersByClient TikTok!
  const users = await getUsersByClient(client_id); // pastikan tiktok field ada di table user
  const videoIds = await getPostsTodayByClient(client_id);

  if (!videoIds.length) return `Tidak ada konten TikTok untuk *Client*: *${client_id}* hari ini.`;

  const userStats = {};
  users.forEach(u => { userStats[u.user_id] = { ...u, count: 0 }; });

  for (const video_id of videoIds) {
    const commenters = await getCommentsByVideoId(video_id);
    const commentsSet = new Set((commenters || []).map(x => (x || '').toLowerCase()));
    users.forEach(u => {
      if (u.tiktok && u.tiktok.trim() !== '' && commentsSet.has(u.tiktok.toLowerCase())) {
        userStats[u.user_id].count += 1;
      }
    });
  }

  const totalKonten = videoIds.length;
  const belumPerDivisi = {};
  let totalUser = Object.values(userStats).length;
  let totalBelum = 0;

  Object.values(userStats).forEach(u => {
    const divisi = u.divisi || '-';
    const titleNama = [u.title, u.nama].filter(Boolean).join(' ');
    const label = u.tiktok && u.tiktok.trim() !== ''
      ? `${titleNama} : ${u.tiktok} (${u.count} konten)`
      : `${titleNama} : belum mengisi data tiktok (${u.count} konten)`;
    if (!u.tiktok || u.tiktok.trim() === '' || u.count < Math.ceil(totalKonten / 2)) {
      if (!belumPerDivisi[divisi]) belumPerDivisi[divisi] = [];
      belumPerDivisi[divisi].push(label);
      totalBelum++;
    }
  });

  const kontenLinks = videoIds.map(vid => `https://www.tiktok.com/video/${vid}`);

  let msg =
    `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar TikTok pada Akun Official :\n\n` +
    `📋 Rekap Akumulasi Komentar TikTok\n*Client*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\nKonten hari ini: ${totalKonten}\n` +
    `Daftar link konten hari ini:\n${kontenLinks.join('\n')}\n\n` +
    `👤 Jumlah user: *${totalUser}*\n❌ Belum melaksanakan: *${totalBelum}*\n\n`;

  Object.keys(belumPerDivisi).forEach(divisi => {
    const arr = belumPerDivisi[divisi];
    msg += `*${divisi}* (${arr.length} user):\n`;
    arr.forEach(line => { msg += `- ${line}\n`; });
    msg += '\n';
  });

  return msg.trim();
}

// --- CRONJOB SCHEDULE (BOTH IG AND TIKTOK) ---
// Setiap jam pada menit ke-40 dari 06:40 s/d 20:40 WIB
cron.schedule('15 6-20 * * *', async () => {
  console.log('[CRON] Mulai tugas fetchInsta, fetchTiktok & absensi...');

  try {
    // 1. Fetch Instagram & absensi IG
    const igClients = await getActiveIGClients();
    await fetchAndStoreInstaContent(["code","caption","like_count","taken_at","comment_count"]);
    for (const client of igClients) {
      const msg = await absensiLikesAkumulasiBelum(client.client_id);
      if (msg && msg.length > 0) {
        for (const admin of getAdminWAIds()) {
          try {
            await waClient.sendMessage(admin, msg);
            console.log(`[CRON] Sent absensi IG client=${client.client_id} to ${admin}`);
          } catch (waErr) {
            console.error(`[CRON ERROR][IG] send WA to ${admin}:`, waErr.message);
          }
        }
      }
    }

    // 2. Fetch TikTok & absensi TikTok
    const tiktokClients = await getActiveTiktokClients();
    await fetchAndStoreTiktokContent(); // no waClient/chatId in cron
    for (const client of tiktokClients) {
      const msg = await absensiTiktokKomentarAkumulasiBelum(client.client_id);
      if (msg && msg.length > 0) {
        for (const admin of getAdminWAIds()) {
          try {
            await waClient.sendMessage(admin, msg);
            console.log(`[CRON] Sent absensi TikTok client=${client.client_id} to ${admin}`);
          } catch (waErr) {
            console.error(`[CRON ERROR][TIKTOK] send WA to ${admin}:`, waErr.message);
          }
        }
      }
    }

    console.log('[CRON] Semua laporan absensi IG dan TikTok berhasil dikirim ke admin.');
  } catch (err) {
    console.error('[CRON ERROR]', err);
    for (const admin of getAdminWAIds()) {
      try {
        await waClient.sendMessage(admin, `[CRON ERROR] ${err.message || err}`);
      } catch (waErr) {
        console.error(`[CRON ERROR] Gagal kirim error ke ${admin}:`, waErr.message);
      }
    }
  }
}, {
  timezone: 'Asia/Jakarta'
});
