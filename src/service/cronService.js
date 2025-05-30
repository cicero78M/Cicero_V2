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
import { fetchAndStoreTiktokContent } from './tiktokFetchService.js';
import { getPostsTodayByClient } from '../model/tiktokPostModel.js';
import { getCommentUsernamesByVideoId } from '../model/tiktokCommentModel.js';

import { pool } from '../config/db.js';
import waClient from './waService.js'; // Pastikan waClient terexport default

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

// === IG CRON ===

async function getActiveClientsIG() {
  const res = await pool.query(
    `SELECT client_id, client_insta FROM clients WHERE client_status = true AND client_insta_status = true AND client_insta IS NOT NULL`
  );
  return res.rows;
}

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

// === TIKTOK CRON ===

async function getActiveClientsTiktok() {
  const res = await pool.query(
    `SELECT client_id, client_tiktok FROM clients WHERE client_status = true AND client_tiktok_status = true AND client_tiktok IS NOT NULL`
  );
  return res.rows;
}

async function absensiKomentarAkumulasiBelum(client_id) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });

  const users = await getUsersByClient(client_id);
  const postsToday = await getPostsTodayByClient(client_id);

  if (!postsToday.length) return `Tidak ada konten TikTok untuk *Client*: *${client_id}* hari ini.`;

  const userStats = {};
  users.forEach(u => { userStats[u.user_id] = { ...u, count: 0 }; });

  for (const postId of postsToday) {
    const comments = await getCommentUsernamesByVideoId(postId);
    const commentsSet = new Set((comments || []).map(x => (x || '').toLowerCase()));
    users.forEach(u => {
      if (u.tiktok && u.tiktok.trim() !== '' && commentsSet.has(u.tiktok.toLowerCase())) {
        userStats[u.user_id].count += 1;
      }
    });
  }

  const totalKonten = postsToday.length;
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

  let msg =
    `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar pada Akun Official TikTok :\n\n` +
    `📋 Rekap Akumulasi Komentar TikTok\n*Client*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\nKonten hari ini: ${totalKonten}\n\n` +
    `👤 Jumlah user: *${totalUser}*\n❌ Belum melaksanakan: *${totalBelum}*\n\n`;

  Object.keys(belumPerDivisi).forEach(divisi => {
    const arr = belumPerDivisi[divisi];
    msg += `*${divisi}* (${arr.length} user):\n`;
    arr.forEach(line => { msg += `- ${line}\n`; });
    msg += '\n';
  });

  return msg.trim();
}

// === CRON IG: Rekap Likes ===
// Tiap jam pada menit ke-40 dari 06:40 s/d 20:40
cron.schedule('40 6-20 * * *', async () => {
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

// === CRON TikTok: Rekap Komentar ===
// Tiap jam pada menit ke-45 dari 06:45 s/d 20:45
cron.schedule('45 6-20 * * *', async () => {
  console.log('[CRON TIKTOK] Mulai tugas fetchTiktok & absensiKomentar akumulasi belum...');
  try {
    const clients = await getActiveClientsTiktok();
    await fetchAndStoreTiktokContent();

    for (const client of clients) {
      const msg = await absensiKomentarAkumulasiBelum(client.client_id);
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

