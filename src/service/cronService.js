// src/service/cronService.js

import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

import { fetchAndStoreInstaContent } from './instaFetchService.js';
import { getUsersByClient } from '../model/userModel.js';
import { getShortcodesTodayByClient } from '../model/instaPostModel.js';
import { getLikesByShortcode } from '../model/instaLikeModel.js';
import { pool } from '../config/db.js';
import waClient from './waService.js'; // Pastikan waClient terexport default

const hariIndo = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

// Ambil dari .env, support hanya nomor (tanpa @c.us)
const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || '')
  .split(',')
  .map(n => n.trim())
  .filter(Boolean);

// Helper agar admin WA id pasti dengan @c.us walau di .env hanya nomor telepon
function getAdminWAIds() {
  return ADMIN_WHATSAPP.map(n =>
    n.endsWith('@c.us') ? n : n.replace(/[^0-9]/g, '') + '@c.us'
  );
}

// Helper: ambil seluruh client eligible
async function getActiveClients() {
  const res = await pool.query(
    `SELECT client_id, client_insta FROM clients WHERE client_status = true AND client_insta_status = true AND client_insta IS NOT NULL`
  );
  return res.rows;
}

// Helper: trigger absensilikes akumulasi belum per client_id
async function absensiLikesAkumulasiBelum(client_id) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });

  const users = await getUsersByClient(client_id);
  const shortcodes = await getShortcodesTodayByClient(client_id);

  if (!shortcodes.length) return `Tidak ada konten IG untuk *Client*: *${client_id}* hari ini.`;

  // AKUMULASI
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

// Cronjob: tiap jam pada menit ke-30 dari 06:30 s/d 20:30 (inclusive)
cron.schedule('30 6-20 * * *', async () => {
  console.log('[CRON] Mulai tugas fetchInsta & absensiLikes akumulasi belum...');
  try {
    // 1. Ambil seluruh client eligible
    const clients = await getActiveClients();

    // 2. Jalankan fetchInsta untuk semua clients
    const keys = ["code","caption","like_count","taken_at","comment_count"]; // sesuaikan dengan keys IG mu
    await fetchAndStoreInstaContent(keys); // mode silent (tanpa waClient/chatId pada cron)

    // 3. Kirim laporan absensi ke semua admin WA
    for (const client of clients) {
      const msg = await absensiLikesAkumulasiBelum(client.client_id);
      if (msg && msg.length > 0) {
        for (const admin of getAdminWAIds()) {
          try {
            await waClient.sendMessage(admin, msg);
            console.log(`[CRON] Sent absensi IG client=${client.client_id} to ${admin}`);
          } catch (waErr) {
            console.error(`[CRON ERROR] send WA to ${admin}:`, waErr.message);
          }
        }
      }
    }
    console.log('[CRON] Laporan absensi likes berhasil dikirim ke admin.');
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
