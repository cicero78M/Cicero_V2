import { getPostsTodayByClient } from '../model/tiktokPostModel.js';
import { getCommentsByVideoId } from '../model/tiktokCommentModel.js';
import { getUsersByClientFull } from '../model/userModel.js';
import waClient from '../service/waService.js';

const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || '')
  .split(',')
  .map(n => n.trim())
  .filter(Boolean);

function getAdminWAIds() {
  return ADMIN_WHATSAPP.map(n =>
    n.endsWith('@c.us') ? n : n.replace(/[^0-9]/g, '') + '@c.us'
  );
}

function formatName(u) {
  const titleNama = [u.title, u.nama].filter(Boolean).join(' ');
  return u.tiktok
    ? `${titleNama} : @${u.tiktok.replace(/^@/, '')}`
    : `${titleNama} : belum mengisi data tiktok`;
}

function groupByDivision(users) {
  return users.reduce((acc, u) => {
    const div = u.divisi || '-';
    if (!acc[div]) acc[div] = [];
    acc[div].push(u);
    return acc;
  }, {});
}

export async function fallbackAbsensiKomentarTiktokHariIni(client_id, customWaClient = null, chatId = null) {
  // Pakai waClient default jika tidak diinject
  const clientWA = customWaClient || waClient;
  const adminList = getAdminWAIds();

  // 1. Ambil user & post hari ini dari DB
  const users = await getUsersByClientFull(client_id);
  const postsToday = await getPostsTodayByClient(client_id);

  // === DEBUG INFO (tanpa array) ===
  let initialDebugMsg = `[DEBUG][FallbackAbsensi] Client: ${client_id}\n` +
    `- Jumlah user TikTok: ${users.length}\n` +
    `- Jumlah post TikTok hari ini: ${postsToday.length}\n`;
  if (!users.length) initialDebugMsg += '- Tidak ada user TikTok untuk client ini.\n';
  if (!postsToday.length) initialDebugMsg += '- Tidak ada post TikTok hari ini di DB untuk client ini.\n';

  // Kirim debug ke console dan seluruh ADMIN_WHATSAPP
  console.log(initialDebugMsg);
  for (const admin of adminList) {
    try { await clientWA.sendMessage(admin, initialDebugMsg); } catch (e) { }
  }
  // Juga ke chatId jika diberikan
  if (clientWA && chatId) {
    try { await clientWA.sendMessage(chatId, initialDebugMsg); } catch (e) { }
  }

  if (!users.length) {
    const msg = "Tidak ada user TikTok yang terdaftar pada client ini.";
    for (const admin of adminList) {
      try { await clientWA.sendMessage(admin, msg); } catch (e) { }
    }
    if (clientWA && chatId) await clientWA.sendMessage(chatId, msg);
    return msg;
  }
  if (!postsToday.length) {
    const msg = `Tidak ada konten TikTok untuk *Client*: *${client_id}* hari ini (DB).`;
    for (const admin of adminList) {
      try { await clientWA.sendMessage(admin, msg); } catch (e) { }
    }
    if (clientWA && chatId) await clientWA.sendMessage(chatId, msg);
    return msg;
  }

  // 2. Proses absensi akumulasi: hitung komentar untuk tiap user
  const userStats = {};
  users.forEach(u => { userStats[u.user_id] = { ...u, count: 0 }; });

  let totalKomentarChecked = 0;
  let userDenganKomentar = 0;
  let komentarDebugMsg = '[DEBUG][KOMENTAR]\n';
  for (const postId of postsToday) {
    const comments = await getCommentsByVideoId(postId);
    komentarDebugMsg += `- Post ${postId}: Jumlah komentar = ${comments ? comments.length : 0}\n`;
    const commentsSet = new Set((comments || []).map(x => (x || '').replace(/^@/, '').toLowerCase()));
    users.forEach(u => {
      const uname = (u.tiktok || '').replace(/^@/, '').toLowerCase();
      if (u.tiktok && u.tiktok.trim() !== '' && commentsSet.has(uname)) {
        userStats[u.user_id].count += 1;
        userDenganKomentar += 1;
      }
    });
    totalKomentarChecked += (comments ? comments.length : 0);
  }

  // Kirim debug komentar ke admin
  for (const admin of adminList) {
    try { await clientWA.sendMessage(admin, komentarDebugMsg); } catch (e) { }
  }
  if (clientWA && chatId) {
    try { await clientWA.sendMessage(chatId, komentarDebugMsg); } catch (e) { }
  }

  // 3. Laporan
  const totalKonten = postsToday.length;
  const sudah = [];
  const belum = [];
  Object.values(userStats).forEach(u => {
    if (u.tiktok && u.tiktok.trim() !== '' && u.count >= Math.ceil(totalKonten / 2)) {
      sudah.push(u);
    } else {
      belum.push(u);
    }
  });

  const divSudah = groupByDivision(sudah);
  const divBelum = groupByDivision(belum);

  // Info tanggal dan jam
  const now = new Date();
  const hari = now.toLocaleDateString('id-ID', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
  });
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });

  // Format link konten
  const kontenLinks = postsToday.map(id => `https://www.tiktok.com/video/${id}`).join('\n');

  // Debug ringkasan summary
  const debugInfo =
    `[DEBUG][ABSENSI TIKTOK] SUMMARY\n` +
    `- Client: ${client_id}\n` +
    `- Jumlah user TikTok: ${users.length}\n` +
    `- Jumlah konten hari ini: ${totalKonten}\n` +
    `- Total komentar dicek: ${totalKomentarChecked}\n` +
    `- User dengan komentar terdeteksi: ${userDenganKomentar}\n` +
    `- Sudah melaksanakan: ${sudah.length} user\n` +
    `- Belum melaksanakan: ${belum.length} user\n` +
    `- Waktu: ${now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
  // Kirim summary debug ke console dan seluruh ADMIN_WHATSAPP
  console.log(debugInfo);
  for (const admin of adminList) {
    try { await clientWA.sendMessage(admin, debugInfo); } catch (e) { }
  }
  if (clientWA && chatId) {
    try { await clientWA.sendMessage(chatId, debugInfo); } catch (e) { }
  }

  // Build pesan laporan absensi
  let msg = `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar pada Akun Official TikTok :\n\n`;
  msg += `📋 Rekap Akumulasi Komentar TikTok\n*Client*: *${client_id}*\n*Hari*: ${hari}\n*Jam*: ${jam}\n`;
  msg += `Jumlah Konten: *${totalKonten}*\nDaftar Link Konten:\n${kontenLinks}\n\n`;
  msg += `Jumlah user: *${users.length}*\n✅ Sudah melaksanakan: *${sudah.length}*\n❌ Belum melaksanakan: *${belum.length}*\n`;

  msg += `\n✅ Sudah melaksanakan${sudah.length ? ` (${sudah.length} user)` : ''}:\n`;
  if (sudah.length) {
    Object.entries(divSudah).forEach(([div, list]) => {
      msg += `*${div}* (${list.length} user):\n`;
      msg += list.map(formatName).map(nm => `- ${nm}`).join('\n') + '\n';
    });
  } else {
    msg += '-\n';
  }

  msg += `\n❌ Belum melaksanakan${belum.length ? ` (${belum.length} user)` : ''}:\n`;
  if (belum.length) {
    Object.entries(divBelum).forEach(([div, list]) => {
      msg += `*${div}* (${list.length} user):\n`;
      msg += list.map(formatName).map(nm => `- ${nm}`).join('\n') + '\n';
    });
  } else {
    msg += '-\n';
  }

  // Kirim pesan laporan
  for (const admin of adminList) {
    try { await clientWA.sendMessage(admin, msg.trim()); } catch (e) { }
  }
  if (clientWA && chatId) await clientWA.sendMessage(chatId, msg.trim());
  return msg.trim();
}
