import { getPostsTodayByClient } from '../model/tiktokPostModel.js';
import { getCommentsByVideoId } from '../model/tiktokCommentModel.js';
import { getUsersByClientFull } from '../model/userModel.js';

// Helper format nama user
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

export async function fallbackAbsensiKomentarTiktokHariIni(client_id, waClient = null, chatId = null) {
  // 1. Ambil user & post hari ini dari DB
  const users = await getUsersByClientFull(client_id);
  const postsToday = await getPostsTodayByClient(client_id);

  // === DEBUG INFO (tanpa array) ===
  console.log(`[DEBUG][FallbackAbsensi] Client: ${client_id}`);
  console.log(`[DEBUG][FallbackAbsensi] Jumlah user TikTok: ${users.length}`);
  console.log(`[DEBUG][FallbackAbsensi] Jumlah post TikTok hari ini: ${postsToday.length}`);
  if (!users.length) console.log(`[DEBUG][FallbackAbsensi] Tidak ada user TikTok untuk client ini.`);
  if (!postsToday.length) console.log(`[DEBUG][FallbackAbsensi] Tidak ada post TikTok hari ini di DB untuk client ini.`);

  if (!users.length) {
    const msg = "Tidak ada user TikTok yang terdaftar pada client ini.";
    if (waClient && chatId) await waClient.sendMessage(chatId, msg);
    return msg;
  }
  if (!postsToday.length) {
    const msg = `Tidak ada konten TikTok untuk *Client*: *${client_id}* hari ini (DB).`;
    if (waClient && chatId) await waClient.sendMessage(chatId, msg);
    return msg;
  }

  // 2. Proses absensi akumulasi: hitung komentar untuk tiap user
  const userStats = {};
  users.forEach(u => { userStats[u.user_id] = { ...u, count: 0 }; });

  let totalKomentarChecked = 0;
  let userDenganKomentar = 0;
  for (const postId of postsToday) {
    const comments = await getCommentsByVideoId(postId);
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

  // Debug ringkasan
  const debugInfo = [
    `[DEBUG][ABSENSI] SUMMARY`,
    `- Client: ${client_id}`,
    `- Jumlah user TikTok: ${users.length}`,
    `- Jumlah konten hari ini: ${totalKonten}`,
    `- Total komentar dicek: ${totalKomentarChecked}`,
    `- User dengan komentar terdeteksi: ${userDenganKomentar}`,
    `- Sudah melaksanakan: ${sudah.length} user`,
    `- Belum melaksanakan: ${belum.length} user`
  ].join('\n');
  console.log(debugInfo);
  if (waClient && chatId) {
    // Debug WA bisa diaktifkan jika ingin (opsional)
    // await waClient.sendMessage(chatId, debugInfo);
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

  if (waClient && chatId) await waClient.sendMessage(chatId, msg.trim());
  return msg.trim();
}
