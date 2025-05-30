import cron from 'node-cron';
import { fetchAndStoreInstaContent } from './instaFetchService.js';
import { getUsersByClient } from '../model/userModel.js';
import { getShortcodesTodayByClient } from '../model/instaPostModel.js';
import { getLikesByShortcode } from '../model/instaLikeModel.js';
import { pool } from '../config/db.js';
import waClient from './waService.js'; // pastikan path ini sesuai projectmu

const hariIndo = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || '')
  .split(',').map(n => n.trim()).filter(Boolean);

// Helper: ambil seluruh client eligible
async function getActiveClients() {
  const res = await pool.query(
    `SELECT client_ID, client_insta FROM clients WHERE client_status = true AND client_insta_status = true AND client_insta IS NOT NULL`
  );
  return res.rows;
}

// Helper: trigger absensilikes akumulasi belum per client_id
async function absensiLikesAkumulasiBelum(client_id) {
  // Copy logic absensilikes handler AKUMULASI BELUM saja
  // (Bisa extract ke function di waService.js jika sudah ada)
  // Atau panggil logic dari handler jika sudah modular.
  // Berikut contoh logic internal singkat (bisa disesuaikan!):

  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });

  const users = await getUsersByClient(client_id);
  const shortcodes = await getShortcodesTodayByClient(client_id);

  if (!shortcodes.length) return `Tidak ada konten IG untuk *Polres*: *${client_id}* hari ini.`;

  // AKUMULASI
  const userStats = {};
  users.forEach(u => { userStats[u.user_id] = { ...u, count: 0 }; });

  for (const shortcode of shortcodes) {
    const likes = await getLikesByShortcode(shortcode);
    const likesSet = new Set(likes.map(x => (x || '').toLowerCase()));
    users.forEach(u => {
      if (u.insta && u.insta.trim() !== '' && likesSet.has(u.insta.toLowerCase())) {
        userStats[u.user_id].count += 1;
      }
    });
  }

  const totalKonten = shortcodes.length;
  const belumPerSatfung = {};
  let totalUser = Object.values(userStats).length;
  let totalBelum = 0;

  Object.values(userStats).forEach(u => {
    const satfung = u.divisi || '-';
    const titleNama = [u.title, u.nama].filter(Boolean).join(' ');
    const label = u.insta && u.insta.trim() !== '' ? `${titleNama} : ${u.insta} (${u.count} konten)` : `${titleNama} : belum mengisi data insta (${u.count} konten)`;
    if (!u.insta || u.insta.trim() === '' || u.count < Math.ceil(totalKonten / 2)) {
      if (!belumPerSatfung[satfung]) belumPerSatfung[satfung] = [];
      belumPerSatfung[satfung].push(label);
      totalBelum++;
    }
  });

  const kontenLinks = shortcodes.map(sc => `https://www.instagram.com/p/${sc}`);

  let msg =
    `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar dan Likes pada Akun Official :\n\n` +
    `📋 Rekap Akumulasi Likes IG\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\nKonten hari ini: ${totalKonten}\n` +
    `Daftar link konten hari ini:\n${kontenLinks.join('\n')}\n\n` +
    `👤 Jumlah user: *${totalUser}*\n❌ Belum melaksanakan: *${totalBelum}*\n\n`;

  Object.keys(belumPerSatfung).forEach(satfung => {
    const arr = belumPerSatfung[satfung];
    msg += `*${satfung}* (${arr.length} user):\n`;
    arr.forEach(line => { msg += `- ${line}\n`; });
    msg += '\n';
  });

  return msg.trim();
}

// Jadwalkan cronjob: tiap jam 06:30–21:30
cron.schedule('00 6-20 * * *', async () => {
  console.log('[CRON] Mulai tugas fetchinsta & absensilikes akumulasi belum...');
  try {
    // 1. Ambil seluruh client eligible
    const clients = await getActiveClients();
    // 2. Jalankan fetchInsta untuk semua clients (dapat pakai keys default jika pakai dynamic)
    const keys = ["code","caption","like_count","taken_at","comment_count"]; // sesuaikan dengan kebutuhanmu
    await fetchAndStoreInstaContent(keys); // tanpa waClient dan chatId jika mode silent
    // 3. Kirim laporan absensi ke semua admin WA
    for (const client of clients) {
      const msg = await absensiLikesAkumulasiBelum(client.client_id);
      for (const admin of ADMIN_WHATSAPP) {
        if (msg && msg.length > 0) {
          await waClient.sendMessage(admin, msg);
        }
      }
    }
    console.log('[CRON] Laporan absensi likes berhasil dikirim ke admin.');
  } catch (err) {
    console.error('[CRON ERROR]', err);
  }
}, {
  timezone: 'Asia/Jakarta'
});
