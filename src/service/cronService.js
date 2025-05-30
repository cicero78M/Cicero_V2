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

// === IG CRON: Absensi Likes Akumulasi Belum ===
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
  let sudah = [], belum = [];
  Object.values(userStats).forEach(u => {
    if (u.insta && u.insta.trim() !== '' && u.count >= Math.ceil(totalKonten/2)) {
      sudah.push(u);
    } else {
      belum.push(u);
    }
  });

  const kontenLinks = shortcodes.map(sc => `https://www.instagram.com/p/${sc}`);

  let msg =
    `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar dan Likes pada Akun Official :\n\n` +
    `📋 Rekap Akumulasi Likes IG\n*Client*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
    `Jumlah Konten: ${totalKonten}\nDaftar Link Konten:\n${kontenLinks.join('\n')}\n\n` +
    `Jumlah user: *${users.length}*\n✅ Sudah melaksanakan: *${sudah.length}*\n❌ Belum melaksanakan: *${belum.length}*\n\n`;

  // Sudah
  if (sudah.length) {
    const sudahDiv = groupByDivision(sudah);
    msg += `✅ Sudah melaksanakan (${sudah.length} user):\n`;
    Object.entries(sudahDiv).forEach(([div, list]) => {
      msg += `*${div}* (${list.length} user):\n`;
      msg += list.map(u => `- ${formatName(u)}`).join('\n') + "\n";
    });
  } else {
    msg += `✅ Sudah melaksanakan: -\n`;
  }
  // Belum
  if (belum.length) {
    const belumDiv = groupByDivision(belum);
    msg += `\n❌ Belum melaksanakan (${belum.length} user):\n`;
    Object.entries(belumDiv).forEach(([div, list]) => {
      msg += `*${div}* (${list.length} user):\n`;
      msg += list.map(u => `- ${formatName(u)}${!u.insta ? " (belum mengisi data insta)" : ""}`).join('\n') + "\n";
    });
  } else {
    msg += `\n❌ Belum melaksanakan: -\n`;
  }

  return msg.trim();
}

// === TIKTOK CRON: Absensi Komentar Akumulasi Belum ===
async function getActiveClientsTiktok() {
  const res = await pool.query(
    `SELECT client_id, client_tiktok FROM clients WHERE client_status = true AND client_tiktok_status = true AND client_tiktok IS NOT NULL`
  );
  return res.rows;
}
function normalizeTikTokUsername(val) {
  if (!val) return "";
  if (val.startsWith("http")) {
    // Ambil dari url: https://www.tiktok.com/@username
    const match = val.match(/tiktok\.com\/@([a-zA-Z0-9._]+)/i);
    return match ? match[1].toLowerCase() : "";
  }
  return val.replace(/^@/, "").trim().toLowerCase();
}

async function absensiKomentarAkumulasiBelum(client_id) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });

  const users = await getUsersByClientFull(client_id);
  const postsToday = await getPostsTodayByClient(client_id);

  if (!postsToday.length) return `Tidak ada konten TikTok untuk *Client*: *${client_id}* hari ini.`;

  // Patch normalisasi username TikTok (pastikan matching)
  const userStats = {};
  users.forEach(u => { userStats[u.user_id] = { ...u, count: 0 }; });

  for (const postId of postsToday) {
    const comments = await getCommentsByVideoId(postId);
    const commentsSet = new Set((comments || []).map(x => normalizeTikTokUsername(x)));
    users.forEach(u => {
      const uname = normalizeTikTokUsername(u.tiktok);
      if (uname && commentsSet.has(uname)) {
        userStats[u.user_id].count += 1;
      }
    });
  }

  const totalKonten = postsToday.length;
  let sudah = [], belum = [];
  Object.values(userStats).forEach(u => {
    const uname = normalizeTikTokUsername(u.tiktok);
    if (uname && u.count >= Math.ceil(totalKonten/2)) {
      sudah.push(u);
    } else {
      belum.push(u);
    }
  });

  const kontenLinks = postsToday.map(id => `https://www.tiktok.com/video/${id}`);

  let msg =
    `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar pada Akun Official TikTok :\n\n` +
    `📋 Rekap Akumulasi Komentar TikTok\n*Client*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
    `Jumlah Konten: ${totalKonten}\nDaftar Link Konten:\n${kontenLinks.join('\n')}\n\n` +
    `Jumlah user: *${users.length}*\n✅ Sudah melaksanakan: *${sudah.length}*\n❌ Belum melaksanakan: *${belum.length}*\n\n`;

  // Sudah
  if (sudah.length) {
    const sudahDiv = groupByDivision(sudah);
    msg += `✅ Sudah melaksanakan (${sudah.length} user):\n`;
    Object.entries(sudahDiv).forEach(([div, list]) => {
      msg += `*${div}* (${list.length} user):\n`;
      msg += list.map(u => `- ${formatName(u)}`).join('\n') + "\n";
    });
  } else {
    msg += `✅ Sudah melaksanakan: -\n`;
  }
  // Belum
  if (belum.length) {
    const belumDiv = groupByDivision(belum);
    msg += `\n❌ Belum melaksanakan (${belum.length} user):\n`;
    Object.entries(belumDiv).forEach(([div, list]) => {
      msg += `*${div}* (${list.length} user):\n`;
      msg += list.map(u => `- ${formatName(u)}${!normalizeTikTokUsername(u.tiktok) ? " (belum mengisi data tiktok)" : ""}`).join('\n') + "\n";
    });
  } else {
    msg += `\n❌ Belum melaksanakan: -\n`;
  }

  return msg.trim();
}

// === CRON IG: Likes ===
cron.schedule('34 6-20 * * *', async () => {
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
cron.schedule('35 6-20 * * *', async () => {
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
