import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import * as clientService from './clientService.js';
import { getTiktokSecUid } from './tiktokService.js';
import { migrateUsersFromFolder } from './userMigrationService.js';
import { checkGoogleSheetCsvStatus } from './checkGoogleSheetAccess.js';
import { importUsersFromGoogleSheet } from './importUsersFromGoogleSheet.js';
import * as userService from './userService.js';
import { fetchAndStoreInstaContent } from './instaFetchService.js';
import { getLikesByShortcode } from '../model/instaLikeModel.js';
import { getShortcodesTodayByClient } from '../model/instaPostModel.js';
import { getUsersByClient } from '../model/userModel.js';import { fetchAndStoreTiktokContent } from './tiktokFetchService.js';

import * as tiktokPostModel from '../model/tiktokPostModel.js';
import * as tiktokCommentModel from '../model/tiktokCommentModel.js';
import * as userModel from '../model/userModel.js'; // pastikan path sudah sesuai



import dotenv from 'dotenv';
dotenv.config();

function isAdminWhatsApp(number) {
  const adminNumbers = (process.env.ADMIN_WHATSAPP || '')
    .split(',')
    .map(n => n.trim())
    .filter(Boolean)
    .map(n => (n.endsWith('@c.us') ? n : n.replace(/\D/g, '') + '@c.us'));
  return adminNumbers.includes(number);
}


// Helper format field
function formatClientData(obj, title = '') {
  let keysOrder = [
    'client_id', 'nama', 'client_type', 'client_status',
    'client_insta', 'client_insta_status', 'client_tiktok', 'client_tiktok_status',
    'client_operator', 'client_super', 'client_group', 'tiktok_secUid'
  ];
  let dataText = title ? `${title}\n` : '';
  for (const key of keysOrder) {
    if (key in obj) {
      let v = obj[key];
      if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
      dataText += `*${key}*: ${v}\n`;
    }
  }
  Object.keys(obj).forEach(key => {
    if (!keysOrder.includes(key)) {
      let v = obj[key];
      if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
      dataText += `*${key}*: ${v}\n`;
    }
  });
  return dataText;
}

function groupByDivision(users) {
  const divGroups = {};
  users.forEach(u => {
    const div = u.divisi || 'LAINNYA';
    if (!divGroups[div]) divGroups[div] = [];
    divGroups[div].push(u);
  });
  return divGroups;
}
function formatName(u) {
  return `${u.title ? u.title + ' ' : ''}${u.nama}${u.tiktok ? ` : ${u.tiktok}` : ''}`;
}


const waClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

waClient.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('[WA] Scan QR dengan WhatsApp Anda!');
});

waClient.on('ready', () => {
  console.log('[WA] WhatsApp client is ready!');
});

waClient.on('message', async (msg) => {
  const chatId = msg.from;
  const text = msg.body.trim();

  // === PATCH: ADMIN ONLY ===
  const adminCommands = [
    'addnewclient#', 'updateclient#', 'removeclient#', 'clientinfo#', 'clientrequest',
    'transferuser#', 'sheettransfer#', 'thisgroup#', 'requestinsta#', 'requesttiktok#'
  ];
  let isAdminCommand = adminCommands.some(cmd => text.toLowerCase().startsWith(cmd));

  if (isAdminCommand && !isAdminWhatsApp(chatId)) {
    await waClient.sendMessage(chatId, '❌ Anda tidak memiliki akses ke sistem ini.');
    return;
  }

  // === PATCH: FETCH INSTAGRAM CONTENT (admin only) ===


  // Helper hari Indonesia
  const hariIndo = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

  if (text.toLowerCase().startsWith('absensilikes#')) {
    const parts = text.split('#');
    if (parts.length < 2) {
      await waClient.sendMessage(chatId, 'Format salah!\nabsensilikes#clientid#[sudah|belum|akumulasi#sudah|akumulasi#belum]');
      return;
    }
    const client_id = parts[1];
    const filter1 = (parts[2] || '').toLowerCase();
    const filter2 = (parts[3] || '').toLowerCase();

    const headerLaporan = `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar dan Likes pada Akun Official :\n\n`;

    const now = new Date();
    const hari = hariIndo[now.getDay()];
    const tanggal = now.toLocaleDateString('id-ID');
    const jam = now.toLocaleTimeString('id-ID', { hour12: false });

    const users = await getUsersByClient(client_id); // {user_id, nama, insta, divisi, title}
    const shortcodes = await getShortcodesTodayByClient(client_id);

    if (!shortcodes.length) {
      await waClient.sendMessage(chatId, headerLaporan +
        `Tidak ada konten IG untuk *Polres*: *${client_id}* hari ini.\n${hari}, ${tanggal}\nJam: ${jam}`);
      return;
    }

    // === AKUMULASI ===
    if (filter1 === 'akumulasi') {
      const userStats = {};
      users.forEach(u => {
        userStats[u.user_id] = { ...u, count: 0 };
      });

      for (const shortcode of shortcodes) {
        const likes = await getLikesByShortcode(shortcode);
        const likesSet = new Set(likes.map(x => (x || '').toLowerCase()));
        users.forEach(u => {
          if (u.insta && likesSet.has(u.insta.toLowerCase())) {
            userStats[u.user_id].count += 1;
          }
        });
      }

      const totalKonten = shortcodes.length;
      const sudahPerSatfung = {};
      const belumPerSatfung = {};
      let totalUser = Object.values(userStats).length;
      let totalSudah = 0;
      let totalBelum = 0;

      Object.values(userStats).forEach(u => {
        const satfung = u.divisi || '-';
        const titleNama = [u.title, u.nama].filter(Boolean).join(' ');
        const label = u.insta && u.insta.trim() !== '' ? `${titleNama} : ${u.insta} (${u.count} konten)` : `${titleNama} : belum mengisi data insta (${u.count} konten)`;
        if (u.insta && u.insta.trim() !== '' && u.count >= Math.ceil(totalKonten / 2)) {
          if (!sudahPerSatfung[satfung]) sudahPerSatfung[satfung] = [];
          sudahPerSatfung[satfung].push(label);
          totalSudah++;
        } else {
          if (!belumPerSatfung[satfung]) belumPerSatfung[satfung] = [];
          belumPerSatfung[satfung].push(label);
          totalBelum++;
        }
      });

      const tipe = filter2 === 'belum' ? 'belum' : 'sudah';
      let msg = headerLaporan +
        `📋 Rekap Akumulasi Likes IG\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\nKonten hari ini: ${totalKonten}\n`;

      const kontenLinks = shortcodes.map(sc => `https://www.instagram.com/p/${sc}`);
      msg += `Daftar link konten hari ini:\n${kontenLinks.join('\n')}\n\n`;

      msg += `👤 Jumlah user: *${totalUser}*\n✅ Sudah melaksanakan: *${totalSudah}*\n❌ Belum melaksanakan: *${totalBelum}*\n\n`;

      if (tipe === 'sudah') {
        Object.keys(sudahPerSatfung).forEach(satfung => {
          const arr = sudahPerSatfung[satfung];
          msg += `*${satfung}* (${arr.length} user):\n`;
          arr.forEach(line => { msg += `- ${line}\n`; });
          msg += '\n';
        });
      } else {
        Object.keys(belumPerSatfung).forEach(satfung => {
          const arr = belumPerSatfung[satfung];
          msg += `*${satfung}* (${arr.length} user):\n`;
          arr.forEach(line => { msg += `- ${line}\n`; });
          msg += '\n';
        });
      }

      await waClient.sendMessage(chatId, msg.trim());
      return;
    }

    // === PER KONTEN IG: SUDAH/BELUM/DUA-DUA (DEFAULT) ===
    for (const shortcode of shortcodes) {
      const likes = await getLikesByShortcode(shortcode);
      const likesSet = new Set(likes.map(x => (x || '').toLowerCase()));

      const sudahPerSatfung = {};
      const belumPerSatfung = {};
      let totalUser = 0;
      let totalSudah = 0;
      let totalBelum = 0;

      users.forEach(u => {
        totalUser++;
        const satfung = u.divisi || '-';
        const titleNama = [u.title, u.nama].filter(Boolean).join(' ');
        if (u.insta && u.insta.trim() !== '' && likesSet.has(u.insta.toLowerCase())) {
          if (!sudahPerSatfung[satfung]) sudahPerSatfung[satfung] = [];
          sudahPerSatfung[satfung].push(`${titleNama} : ${u.insta}`);
          totalSudah++;
        } else {
          if (!belumPerSatfung[satfung]) belumPerSatfung[satfung] = [];
          const label = u.insta && u.insta.trim() !== '' ? `${titleNama} : ${u.insta}` : `${titleNama} : belum mengisi data insta`;
          belumPerSatfung[satfung].push(label);
          totalBelum++;
        }
      });

      const linkIG = `https://www.instagram.com/p/${shortcode}`;

      if (!filter1) {
        let msg = headerLaporan +
          `📋 Absensi Likes IG\n*Polres*: *${client_id}*\nLink: ${linkIG}\n${hari}, ${tanggal}\nJam: ${jam}\n` +
          `👤 Jumlah user: *${totalUser}*\n✅ Sudah melaksanakan: *${totalSudah}*\n❌ Belum melaksanakan: *${totalBelum}*\n\n`;

        msg += `✅ SUDAH Like:\n`;
        Object.keys(sudahPerSatfung).forEach(satfung => {
          const arr = sudahPerSatfung[satfung];
          msg += `*${satfung}* (${arr.length} user):\n`;
          arr.forEach(line => { msg += `- ${line}\n`; });
          msg += '\n';
        });

        msg += `\n❌ BELUM Like:\n`;
        Object.keys(belumPerSatfung).forEach(satfung => {
          const arr = belumPerSatfung[satfung];
          msg += `*${satfung}* (${arr.length} user):\n`;
          arr.forEach(line => { msg += `- ${line}\n`; });
          msg += '\n';
        });

        await waClient.sendMessage(chatId, msg.trim());
      }

      if (filter1 === 'sudah') {
        let msg = headerLaporan +
          `📋 Rekap User yang sudah melakukan Likes IG\n*Polres*: *${client_id}*\nLink: ${linkIG}\n${hari}, ${tanggal}\nJam: ${jam}\n` +
          `👤 Jumlah user: *${totalUser}*\n✅ Sudah melaksanakan: *${totalSudah}*\n❌ Belum melaksanakan: *${totalBelum}*\n\n`;

        Object.keys(sudahPerSatfung).forEach(satfung => {
          const arr = sudahPerSatfung[satfung];
          msg += `*${satfung}* (${arr.length} user):\n`;
          arr.forEach(line => { msg += `- ${line}\n`; });
          msg += '\n';
        });
        await waClient.sendMessage(chatId, msg.trim());
      }

      if (filter1 === 'belum') {
        let msg = headerLaporan +
          `📋 Rekap User yang *BELUM* Likes IG\n*Polres*: *${client_id}*\nLink: ${linkIG}\n${hari}, ${tanggal}\nJam: ${jam}\n` +
          `👤 Jumlah user: *${totalUser}*\n✅ Sudah melaksanakan: *${totalSudah}*\n❌ Belum melaksanakan: *${totalBelum}*\n\n`;

        Object.keys(belumPerSatfung).forEach(satfung => {
          const arr = belumPerSatfung[satfung];
          msg += `*${satfung}* (${arr.length} user):\n`;
          arr.forEach(line => { msg += `- ${line}\n`; });
          msg += '\n';
        });
        await waClient.sendMessage(chatId, msg.trim());
      }
    }
    return;
  }


if (text.toLowerCase().startsWith('absensikomentar#')) {
  const parts = text.toLowerCase().split('#');
  const client_id = parts[1];
  const type = parts[2] || '';
  const subtype = parts[3] || '';

  if (!client_id) {
    await waClient.sendMessage(chatId, 'Format: absensikomentar#clientid');
    return;
  }
  const videoIds = await tiktokPostModel.getPostsTodayByClient(client_id);
  if (!videoIds.length) {
    await waClient.sendMessage(chatId, 'Tidak ada konten TikTok hari ini.');
    return;
  }
  const users = await userModel.getUsersByClient(client_id);
  const normalize = v => (v || '').replace(/^@/, '').toLowerCase();
  let absensiPerUser = {};
  users.forEach(u => absensiPerUser[u.user_id] = { ...u, count: 0, total: 0 });

  for (const video_id of videoIds) {
    const commenters = await tiktokCommentModel.getCommentsByVideoId(video_id);
    const usernameSet = new Set(commenters.map(c => normalize(c)));
    let sudah = [], belum = [];
    users.forEach(u => {
      const uname = normalize(u.tiktok);
      if (!u.tiktok) {
        belum.push({ ...u, note: 'belum mengisi data tiktok' });
      } else if (usernameSet.has(uname)) {
        sudah.push(u);
      } else {
        belum.push(u);
      }
      absensiPerUser[u.user_id].total += 1;
      if (uname && usernameSet.has(uname)) absensiPerUser[u.user_id].count += 1;
    });

    if (type === 'akumulasi') continue;
    if (type === 'sudah') {
      sudah = sudah.filter(u => u.tiktok);
      belum = [];
    } else if (type === 'belum') {
      belum = belum;
      sudah = [];
    }
    const divSudah = groupByDivision(sudah);
    const divBelum = groupByDivision(belum);
    let now = new Date();
    let jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let hari = now.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    const link = `https://www.tiktok.com/video/${video_id}`;
    let resp = `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar pada Akun Official :\n\n`;
    resp += `📋 *Rekap User yang sudah komentar TikTok*\n`;
    resp += `*Client*: *${client_id}*\n*Link*: ${link}\n*Hari*: ${hari}\n*Jam*: ${jam}\n\n`;

    if (sudah.length) {
      resp += `✅ *Sudah melaksanakan* (${sudah.length} user):\n`;
      Object.entries(divSudah).forEach(([div, list]) => {
        resp += `*${div}* (${list.length} user):\n`;
        resp += list.map(u => `- ${formatName(u)}`).join('\n') + '\n';
      });
    } else {
      resp += `✅ *Sudah melaksanakan*: -\n`;
    }
    if (belum.length) {
      resp += `\n❌ *Belum melaksanakan* (${belum.length} user):\n`;
      Object.entries(divBelum).forEach(([div, list]) => {
        resp += `*${div}* (${list.length} user):\n`;
        resp += list.map(u => `- ${formatName(u)}${u.note ? ` (${u.note})` : ''}`).join('\n') + '\n';
      });
    } else {
      resp += `\n❌ *Belum melaksanakan*: -\n`;
    }
    resp += `\nTotal user: *${users.length}*`;
    await waClient.sendMessage(chatId, resp);
  }

  // Akumulasi semua video hari ini
  if (type === 'akumulasi') {
    const minDone = Math.ceil(videoIds.length * 0.5);
    let sudah = [], belum = [];
    Object.values(absensiPerUser).forEach(u => {
      if (u.count >= minDone) sudah.push(u);
      else belum.push(u);
    });
    if (subtype === 'sudah') belum = [];
    if (subtype === 'belum') sudah = [];
    const divSudah = groupByDivision(sudah);
    const divBelum = groupByDivision(belum);

    let now = new Date();
    let jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let hari = now.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

    const links = videoIds.map(id => `https://www.tiktok.com/video/${id}`).join('\n');
    let resp = `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar pada Akun Official :\n\n`;
    resp += `📋 *Rekap Akumulasi Pelaksanaan Komentar TikTok*\n`;
    resp += `*Client*: *${client_id}*\n*Hari*: ${hari}\n*Jam*: ${jam}\n\n`;
    resp += `*Total konten hari ini*: ${videoIds.length}\n\n`;
    resp += `*Link konten hari ini:*\n${links}\n\n`;
    if (sudah.length) {
      resp += `✅ *Sudah melaksanakan* (${sudah.length} user):\n`;
      Object.entries(divSudah).forEach(([div, list]) => {
        resp += `*${div}* (${list.length} user):\n`;
        resp += list.map(u => `- ${formatName(u)}`).join('\n') + '\n';
      });
    } else {
      resp += `✅ *Sudah melaksanakan*: -\n`;
    }
    if (belum.length) {
      resp += `\n❌ *Belum melaksanakan* (${belum.length} user):\n`;
      Object.entries(divBelum).forEach(([div, list]) => {
        resp += `*${div}* (${list.length} user):\n`;
        resp += list.map(u => `- ${formatName(u)}`).join('\n') + '\n';
      });
    } else {
      resp += `\n❌ *Belum melaksanakan*: -\n`;
    }
    resp += `\nTotal user: *${users.length}*`;
    await waClient.sendMessage(chatId, resp);
  }
}

    
  // Tambahkan patch ini di bawah baris adminCommands:


// ... di dalam waClient.on('message', async (msg) => { ... }

if (text.trim().toLowerCase().startsWith('fetchtiktok#')) {
  // Hanya boleh diakses oleh ADMIN_WHATSAPP
  if (!isAdminWhatsApp(chatId)) {
    await waClient.sendMessage(chatId, 'Akses ditolak.');
    return;
  }
  await waClient.sendMessage(chatId, '⏳ Proses fetch konten TikTok dimulai...');

  try {
    // Jalankan fetch TikTok & summary hasil
    const hasil = await fetchAndStoreTiktokContent(true, waClient, chatId); // mode manual
    await waClient.sendMessage(chatId, hasil?.message || 'Fetch TikTok selesai.');
  } catch (e) {
    await waClient.sendMessage(chatId, `❌ Gagal fetch TikTok: ${e.message}`);
  }
  return;
}


  if (text.startsWith('fetchinsta#')) {
    if (!isAdminWhatsApp(chatId)) {
      await waClient.sendMessage(chatId, 'Akses ditolak.');
      return;
    }
    const keysString = text.replace('fetchinsta#', '').trim();
    let keys;
    if (!keysString) {
      keys = [
        "shortcode", "caption", "like_count", "timestamp"
        // dst
      ];
    } else {
      keys = keysString.split(',').map(k => k.trim());
    }
    // Panggil fungsi dan lempar waClient + chatId
    try {
      await fetchAndStoreInstaContent(keys, waClient, chatId);
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal fetch/simpan: ${err.message}`);
    }
    return;
  }



  // === REQUEST ABSENSI TIKTOK/INSTA (admin only) ===
  if (text.toLowerCase().startsWith('requesttiktok#')) {
    const [, client_id, status] = text.split('#');
    if (!client_id || (status !== 'sudah' && status !== 'belum')) {
      await waClient.sendMessage(chatId, 'Format salah!\nGunakan: requesttiktok#clientid#sudah atau requesttiktok#clientid#belum');
      return;
    }

    if (status === 'sudah') {
      try {
        const users = await userService.getTiktokFilledUsersByClient(client_id);
        if (!users || users.length === 0) {
          await waClient.sendMessage(chatId, `Tidak ada user dari client *${client_id}* yang sudah mengisi data TikTok.`);
          return;
        }
        const perDivisi = {};
        users.forEach(u => {
          if (!perDivisi[u.divisi]) perDivisi[u.divisi] = [];
          perDivisi[u.divisi].push(u);
        });
        let reply = `📋 *Rekap User yang sudah mengisi TikTok*\n*Client*: ${client_id}\n`;
        Object.entries(perDivisi).forEach(([divisi, list]) => {
          reply += `\n*${divisi}* (${list.length} user):\n`;
          list.forEach(u => {
            reply += `- ${u.title ? u.title + ' ' : ''}${u.nama} : ${u.tiktok}\n`;
          });
        });
        reply += `\nTotal user: *${users.length}*`;
        await waClient.sendMessage(chatId, reply);
      } catch (err) {
        await waClient.sendMessage(chatId, `❌ Gagal mengambil data: ${err.message}`);
      }
      return;
    }

    if (status === 'belum') {
      try {
        const users = await userService.getTiktokEmptyUsersByClient(client_id);
        if (!users || users.length === 0) {
          await waClient.sendMessage(chatId, `Semua user dari client *${client_id}* sudah mengisi data TikTok!`);
          return;
        }
        const perDivisi = {};
        users.forEach(u => {
          if (!perDivisi[u.divisi]) perDivisi[u.divisi] = [];
          perDivisi[u.divisi].push(u);
        });
        let reply = `📋 *Rekap User yang BELUM mengisi TikTok*\n*Client*: ${client_id}\n`;
        Object.entries(perDivisi).forEach(([divisi, list]) => {
          reply += `\n*${divisi}* (${list.length} user):\n`;
          list.forEach(u => {
            reply += `- ${u.title ? u.title + ' ' : ''}${u.nama}\n`;
          });
        });
        reply += `\nTotal user: *${users.length}*`;
        await waClient.sendMessage(chatId, reply);
      } catch (err) {
        await waClient.sendMessage(chatId, `❌ Gagal mengambil data: ${err.message}`);
      }
      return;
    }
  }

  if (text.toLowerCase().startsWith('requestinsta#')) {
    const [, client_id, status] = text.split('#');
    if (!client_id || (status !== 'sudah' && status !== 'belum')) {
      await waClient.sendMessage(chatId, 'Format salah!\nGunakan: requestinsta#clientid#sudah atau requestinsta#clientid#belum');
      return;
    }
    if (status === 'belum') {
      try {
        const users = await userService.getInstaEmptyUsersByClient(client_id);
        if (!users || users.length === 0) {
          await waClient.sendMessage(chatId, `Semua user dari client *${client_id}* sudah mengisi data Instagram!`);
          return;
        }
        const perDivisi = {};
        users.forEach(u => {
          if (!perDivisi[u.divisi]) perDivisi[u.divisi] = [];
          perDivisi[u.divisi].push(u);
        });
        let reply = `📋 *Rekap User yang BELUM mengisi Instagram*\n*Client*: ${client_id}\n`;
        Object.entries(perDivisi).forEach(([divisi, list]) => {
          reply += `\n*${divisi}* (${list.length} user):\n`;
          list.forEach(u => {
            reply += `- ${u.title ? u.title + ' ' : ''}${u.nama}\n`;
          });
        });
        reply += `\nTotal user: *${users.length}*`;
        await waClient.sendMessage(chatId, reply);
      } catch (err) {
        await waClient.sendMessage(chatId, `❌ Gagal mengambil data: ${err.message}`);
      }
      return;
    }
    if (status === 'sudah') {
      try {
        const users = await userService.getInstaFilledUsersByClient(client_id);
        if (!users || users.length === 0) {
          await waClient.sendMessage(chatId, `Tidak ada user dari client *${client_id}* yang sudah mengisi data Instagram.`);
          return;
        }
        const perDivisi = {};
        users.forEach(u => {
          if (!perDivisi[u.divisi]) perDivisi[u.divisi] = [];
          perDivisi[u.divisi].push(u);
        });
        let reply = `📋 *Rekap User yang sudah mengisi Instagram*\n*Client*: ${client_id}\n`;
        Object.entries(perDivisi).forEach(([divisi, list]) => {
          reply += `\n*${divisi}* (${list.length} user):\n`;
          list.forEach(u => {
            reply += `- ${u.title ? u.title + ' ' : ''}${u.nama} : ${u.insta}\n`;
          });
        });
        reply += `\nTotal user: *${users.length}*`;
        await waClient.sendMessage(chatId, reply);
      } catch (err) {
        await waClient.sendMessage(chatId, `❌ Gagal mengambil data: ${err.message}`);
      }
      return;
    }
  }

  if (text.toLowerCase().startsWith('sheettransfer#')) {
    const [, client_id, ...linkParts] = text.split('#');
    const sheetUrl = linkParts.join('#').trim();
    if (!client_id || !sheetUrl) {
      await waClient.sendMessage(chatId, 'Format: sheettransfer#clientid#link_google_sheet');
      return;
    }
    const check = await checkGoogleSheetCsvStatus(sheetUrl);
    if (!check.ok) {
      await waClient.sendMessage(chatId, `❌ Sheet tidak bisa diakses:\n${check.reason}`);
      return;
    }
    await waClient.sendMessage(chatId, `⏳ Mengambil & migrasi data dari Google Sheet...`);
    try {
      const result = await importUsersFromGoogleSheet(sheetUrl, client_id);
      let report = `*Hasil import user ke client ${client_id}:*\n`;
      result.forEach(r => {
        report += `- ${r.user_id}: ${r.status}${r.error ? ' (' + r.error + ')' : ''}\n`;
      });
      await waClient.sendMessage(chatId, report);
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal import: ${err.message}`);
    }
    return;
  }


  // === UPDATE client_group DARI GROUP ===
  if (text.toLowerCase().startsWith('thisgroup#')) {
    // Hanya bisa digunakan dalam grup WhatsApp
    if (!msg.from.endsWith('@g.us')) {
      await waClient.sendMessage(chatId, '❌ Perintah ini hanya bisa digunakan di dalam group WhatsApp!');
      return;
    }
    const [, client_id] = text.split('#');
    if (!client_id) {
      await waClient.sendMessage(chatId, 'Format salah!\nGunakan: thisgroup#ClientID');
      return;
    }
    // Ambil WhatsApp Group ID dari msg.from
    const groupId = msg.from;
    try {
      // Update client_group di database
      const updated = await clientService.updateClient(client_id, { client_group: groupId });
      if (updated) {
        let groupName = '';
        try {
          const groupData = await waClient.getChatById(groupId);
          groupName = groupData.name ? `\nNama Group: *${groupData.name}*` : '';
        } catch (e) {}
        let dataText = `✅ Group ID berhasil disimpan untuk *${client_id}*:\n*${groupId}*${groupName}`;
        await waClient.sendMessage(chatId, dataText);
        if (updated.client_operator && updated.client_operator.length >= 8) {
          const operatorId = formatToWhatsAppId(updated.client_operator);
          if (operatorId !== chatId) {
            await waClient.sendMessage(operatorId, `[Notifikasi]: Client group *${client_id}* diupdate ke group ID: ${groupId}`);
          }
        }
      } else {
        await waClient.sendMessage(chatId, `❌ Client dengan ID ${client_id} tidak ditemukan!`);
      }
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal update client_group: ${err.message}`);
    }
    return;
  }

  // === ADD NEW CLIENT ===
  if (text.toLowerCase().startsWith('addnewclient#')) {
    const [cmd, client_id, nama] = text.split('#');
    if (!client_id || !nama) {
      await waClient.sendMessage(chatId, 'Format salah!\nGunakan: addnewclient#clientid#clientname');
      return;
    }
    try {
      const newClient = await clientService.createClient({
        client_id,
        nama,
        client_type: '',
        client_status: true,
        client_insta: '',
        client_insta_status: false,
        client_tiktok: '',
        client_tiktok_status: false,
        client_operator: '',
        client_super: '',      // <== pastikan support field ini!
        client_group: '',
        tiktok_secUid: ''
      });

      let dataText = formatClientData(newClient, `✅ Data Client *${newClient.client_id}* berhasil ditambah:`);
      await waClient.sendMessage(chatId, dataText);

      if (newClient.client_operator && newClient.client_operator.length >= 8) {
        const operatorId = formatToWhatsAppId(newClient.client_operator);
        if (operatorId !== chatId) {
          await waClient.sendMessage(operatorId, `[Notifikasi]:\n${dataText}`);
        }
      }
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal tambah client: ${err.message}`);
    }
    return;
  }

  // === UPDATE CLIENT (BISA JUGA OTOMATIS UPDATE tiktok_secUid) ===
  if (text.toLowerCase().startsWith('updateclient#')) {
    const parts = text.split('#');

    // === OTOMATIS UPDATE tiktok_secUid ===
    if (parts.length === 3 && parts[2] === 'tiktok_secUid') {
      const [, client_id, key] = parts;
      try {
        const client = await clientService.findClientById(client_id);
        if (!client) {
          await waClient.sendMessage(chatId, `❌ Client dengan ID ${client_id} tidak ditemukan!`);
          return;
        }
        let username = client.client_tiktok || '';
        if (!username) {
          await waClient.sendMessage(chatId, `❌ Username TikTok belum diisi pada client dengan ID ${client_id}.`);
          return;
        }
        const secUid = await getTiktokSecUid(username);
        const updated = await clientService.updateClient(client_id, { tiktok_secUid: secUid });
        if (updated) {
          let dataText = formatClientData(updated, `✅ tiktok_secUid untuk client *${client_id}* berhasil diupdate dari username *@${username}*:\n\n*secUid*: ${secUid}\n\n*Data Terbaru:*`);
          await waClient.sendMessage(chatId, dataText);
          if (updated.client_operator && updated.client_operator.length >= 8) {
            const operatorId = formatToWhatsAppId(updated.client_operator);
            if (operatorId !== chatId) {
              await waClient.sendMessage(operatorId, `[Notifikasi]:\n${dataText}`);
            }
          }
        } else {
          await waClient.sendMessage(chatId, `❌ Gagal update secUid ke client.`);
        }
      } catch (err) {
        await waClient.sendMessage(chatId, `❌ Gagal proses: ${err.message}`);
      }
      return;
    }

    // === UPDATE FIELD BIASA ===
    if (parts.length >= 4) {
      const [, client_id, key, ...valueParts] = parts;
      const value = valueParts.join('#');
      try {
        const updateObj = {};
        if (['client_status', 'client_insta_status', 'client_tiktok_status'].includes(key)) {
          updateObj[key] = value === 'true';
        } else if (key === 'client_tiktok' || key === 'client_insta') {
          updateObj[key] = value; // Simpan username string
        } else {
          updateObj[key] = value;
        }
        const updated = await clientService.updateClient(client_id, updateObj);

        if (updated) {
          let dataText = formatClientData(updated, `✅ Data Client *${client_id}* berhasil diupdate:`);
          await waClient.sendMessage(chatId, dataText);

          if (updated.client_operator && updated.client_operator.length >= 8) {
            const operatorId = formatToWhatsAppId(updated.client_operator);
            if (operatorId !== chatId) {
              await waClient.sendMessage(operatorId, `[Notifikasi]:\n${dataText}`);
            }
          }
        } else {
          await waClient.sendMessage(chatId, `❌ Client dengan ID ${client_id} tidak ditemukan!`);
        }
      } catch (err) {
        await waClient.sendMessage(chatId, `❌ Gagal update client: ${err.message}`);
      }
      return;
    }

    // FORMAT SALAH
    await waClient.sendMessage(chatId, 'Format salah!\n' +
      'updateclient#clientid#key#value\n' +
      'atau updateclient#clientid#tiktok_secUid (untuk update secUid otomatis dari username TikTok)');
    return;
  }

  // === GET CLIENT INFO ===
  if (text.toLowerCase().startsWith('clientinfo#')) {
    const [, client_id] = text.split('#');
    if (!client_id) {
      await waClient.sendMessage(chatId, 'Format salah!\nGunakan: clientinfo#clientid');
      return;
    }
    try {
      const client = await clientService.findClientById(client_id);
      if (client) {
        let dataText = formatClientData(client, `ℹ️ Info Data Client *${client_id}*:\n`);
        await waClient.sendMessage(chatId, dataText);

        if (client.client_operator && client.client_operator.length >= 8) {
          const operatorId = formatToWhatsAppId(client.client_operator);
          if (operatorId !== chatId) {
            await waClient.sendMessage(operatorId, `[Notifikasi Client Info]:\n${dataText}`);
          }
        }
      } else {
        await waClient.sendMessage(chatId, `❌ Client dengan ID ${client_id} tidak ditemukan!`);
      }
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal mengambil data client: ${err.message}`);
    }
    return;
  }

  // === REMOVE CLIENT ===
  if (text.toLowerCase().startsWith('removeclient#')) {
    const [, client_id] = text.split('#');
    if (!client_id) {
      await waClient.sendMessage(chatId, 'Format salah!\nGunakan: removeclient#clientid');
      return;
    }
    try {
      const removed = await clientService.deleteClient(client_id);
      if (removed) {
        let dataText = formatClientData(removed, `🗑️ Client *${client_id}* berhasil dihapus!\nData sebelumnya:\n`);
        await waClient.sendMessage(chatId, dataText);

        if (removed.client_operator && removed.client_operator.length >= 8) {
          const operatorId = formatToWhatsAppId(removed.client_operator);
          if (operatorId !== chatId) {
            await waClient.sendMessage(operatorId, `[Notifikasi]:\n${dataText}`);
          }
        }
      } else {
        await waClient.sendMessage(chatId, `❌ Client dengan ID ${client_id} tidak ditemukan!`);
      }
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal hapus client: ${err.message}`);
    }
    return;
  }

  
  // MIGRASI USER DARI FOLDER

  if (text.toLowerCase().startsWith('transferuser#')) {
    const [, client_id] = text.split('#');
    if (!client_id) {
      await waClient.sendMessage(chatId, 'Format salah!\nGunakan: transferuser#clientid');
      return;
    }
    await waClient.sendMessage(chatId, `⏳ Migrasi user dari user_data/${client_id}/ ...`);
    try {
      // Panggil migrasi, tunggu SEMUA file selesai diproses (success/gagal)
      const result = await migrateUsersFromFolder(client_id);
      let report = `*Hasil transfer user dari client ${client_id}:*\n`;
      result.forEach(r => {
        report += `- ${r.file}: ${r.status}${r.error ? ' (' + r.error + ')' : ''}\n`;
      });

      // Optional: Notifikasi jika semua sukses
      if (result.length > 0 && result.every(r => r.status === '✅ Sukses')) {
        report += '\n🎉 Semua user berhasil ditransfer!';
      }
      if (result.length === 0) {
        report += '\n(Tidak ada file user yang ditemukan atau diproses)';
      }

      await waClient.sendMessage(chatId, report);
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal proses transfer: ${err.message}`);
    }
    return;
  }

    // === LIST CLIENT COMMANDS + UPDATE KEYS ===
  if (text.toLowerCase() === 'clientrequest') {
    const updateKeys = [
      'nama',
      'client_type',
      'client_status',
      'client_insta',
      'client_insta_status',
      'client_tiktok',
      'client_tiktok_status',
      'client_operator',
      'client_super',
      'client_group',
      'tiktok_secUid'
    ];

    const menu = `
  📝 *Client Request Commands:*
  1. *addnewclient#clientid#clientname*
    - Tambah data client baru.
  2. *updateclient#clientid#key#value*
    - Update data client berdasarkan key.
  3. *removeclient#clientid*
    - Hapus data client.
  4. *clientinfo#clientid*
    - Lihat detail data client.
  5. *clientrequest*
    - Tampilkan daftar perintah ini.
  6. *transferuser#clientid*
    - Migrasi seluruh data user (dari folder user_data/clientid) ke database (khusus admin/akses tertentu).

  *Key yang dapat digunakan pada updateclient#:*
  ${updateKeys.map(k => `- *${k}*`).join('\n')}

  Contoh update:
  updateclient#BOJONEGORO#client_status#true
  updateclient#BOJONEGORO#client_insta_status#false
  updateclient#BOJONEGORO#client_operator#628123456789
  updateclient#BOJONEGORO#client_super#6281234567890
  updateclient#BOJONEGORO#client_tiktok#bjn_tiktok
  updateclient#BOJONEGORO#tiktok_secUid

  _Catatan: Value untuk key boolean gunakan true/false, untuk username TikTok dan Instagram cukup string._
    `;
    await waClient.sendMessage(chatId, menu);
    return;
  }

  if (text.toLowerCase() === 'userrequest') {
  const menu = `
📝 *User Request Commands:*

1. *mydata#NRP/NIP*
   - Melihat data user Anda sendiri (dengan penamaan sesuai POLRI: NRP/NIP, pangkat, satfung, jabatan, status).
   - Hanya dapat diakses oleh nomor WhatsApp yang terdaftar (otomatis bind jika masih kosong).

2. *updateuser#NRP/NIP#field#value*
   - Mengubah data user.
   - Field yang bisa diubah (hanya untuk user sendiri):
     - *nama*           : update nama user.
     - *pangkat*        : update pangkat (hanya bisa pilih dari list yang valid di database).
     - *satfung*        : update satfung (hanya bisa pilih dari list yang valid di database & POLRES yang sama).
     - *jabatan*        : update jabatan.
     - *insta*          : update/isi profil Instagram, format: https://www.instagram.com/username
     - *tiktok*         : update/isi profil TikTok, format: https://www.tiktok.com/@username
     - *whatsapp*       : binding atau update nomor WhatsApp user (hanya satu user per nomor WA, otomatis bind jika null).
   - Contoh:
     - updateuser#75070206#pangkat#AKP
     - updateuser#75070206#satfung#BAGOPS
     - updateuser#75070206#jabatan#KABAGOPS
     - updateuser#75070206#insta#https://www.instagram.com/edi.suyono
     - updateuser#75070206#tiktok#https://www.tiktok.com/@edisuyono
     - updateuser#75070206#whatsapp#6281234567890

*Catatan:*
- Untuk update pangkat atau satfung hanya bisa memilih dari list yang valid. Jika salah akan dikirimkan daftar yang bisa digunakan.
- Nomor WhatsApp hanya boleh digunakan pada satu user (tidak bisa dipakai di dua user berbeda).
- Untuk update profil Instagram/TikTok, masukkan *link profil* (sistem otomatis mengambil username dari link).
- Semua perubahan hanya bisa dilakukan oleh user dengan nomor WhatsApp yang sudah terdaftar pada user tersebut. Jika nomor WA masih kosong, akan otomatis bind ke nomor pengirim pertama.

3. *userrequest*
   - Menampilkan menu bantuan user ini.

`;
  await waClient.sendMessage(chatId, menu);
  return;
}

// === UPDATE USER: NAMA, PANGKAT, SATFUNG, JABATAN ===
if (text.toLowerCase().startsWith('updateuser#')) {
  const parts = text.split('#');
  if (parts.length !== 4) {
    await waClient.sendMessage(chatId, 'Format salah!\nGunakan: updateuser#user_id#field#value');
    return;
  }
  const [, user_id, field, valueRaw] = parts;
  const allowedFields = ['nama', 'title', 'pangkat', 'divisi', 'satfung', 'jabatan', 'insta', 'tiktok', 'whatsapp'];
  let fieldNorm = field.toLowerCase();
  // Normalisasi: 'pangkat' -> 'title', 'satfung' -> 'divisi'
  if (fieldNorm === 'pangkat') fieldNorm = 'title';
  if (fieldNorm === 'satfung') fieldNorm = 'divisi';

  if (!allowedFields.includes(fieldNorm)) {
    await waClient.sendMessage(chatId, '❌ Field hanya bisa: nama, pangkat, satfung, jabatan, insta, tiktok, whatsapp');
    return;
  }
  // Cek user
  const user = await userService.findUserById(user_id);
  if (!user) {
    await waClient.sendMessage(chatId, `❌ User dengan NRP/NIP ${user_id} tidak ditemukan`);
    return;
  }
  // Cek nomor WA: binding jika masih null, kalau sudah harus sama dengan pengirim
  const pengirim = chatId.replace(/[^0-9]/g, '');
  if (!user.whatsapp || user.whatsapp === '') {
    await userService.updateUserField(user_id, 'whatsapp', pengirim);
    user.whatsapp = pengirim;
  }
  if (user.whatsapp !== pengirim) {
    await waClient.sendMessage(chatId, '❌ Hanya WhatsApp yang terdaftar pada user ini yang dapat mengubah data.');
    return;
  }
  let value = valueRaw.trim();

  // 1. Pangkat/title: harus cocok salah satu di DB (distinct, case-insensitive)
  if (fieldNorm === 'title') {
    const allTitles = await userService.getDistinctUserTitles();
    const valid = allTitles.map(t => t && t.trim().toLowerCase()).filter(Boolean);
    if (!valid.includes(value.toLowerCase())) {
      let msg = '❌ Pangkat tidak valid. List pangkat yang bisa digunakan:\n';
      msg += allTitles.map(t => '- ' + t).join('\n');
      await waClient.sendMessage(chatId, msg);
      return;
    }
  }
  // 2. Satfung/divisi: harus ada pada client_id ini
  if (fieldNorm === 'divisi') {
    const allDiv = await userService.getDistinctUserDivisions(user.client_id);
    const valid = allDiv.map(d => d && d.trim().toLowerCase()).filter(Boolean);
    if (!valid.includes(value.toLowerCase())) {
      let msg = `❌ Satfung tidak valid untuk POLRES ${user.client_id}. List satfung yang bisa digunakan:\n`;
      msg += allDiv.map(d => '- ' + d).join('\n');
      await waClient.sendMessage(chatId, msg);
      return;
    }
  }

  // 3. Cek duplikasi username insta/tiktok (jika update field insta/tiktok)
  if (fieldNorm === 'insta' || fieldNorm === 'tiktok') {
    // Bisa gunakan validasi dan parsing seperti sebelumnya (cek duplikat)
    const exists = await userService.findUserByField(fieldNorm, value);
    if (exists && exists.user_id !== user_id) {
      await waClient.sendMessage(chatId, `❌ Username ${fieldNorm === 'insta' ? 'Instagram' : 'TikTok'} ini sudah digunakan user lain.`);
      return;
    }
    // Validasi format jika ingin ketat (contoh, pakai regex profile IG/tiktok)
    if (fieldNorm === 'insta') {
      const igMatch = value.match(/^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]+)(\/)?(\?|$)/i);
      if (!igMatch) {
        await waClient.sendMessage(chatId, '❌ Format salah! Masukkan *link profil Instagram*, contoh: https://www.instagram.com/username');
        return;
      }
      value = igMatch[2]; // hanya username
    }
    if (fieldNorm === 'tiktok') {
      const ttMatch = value.match(/^https?:\/\/(www\.)?tiktok\.com\/@([A-Za-z0-9._]+)(\/)?(\?|$)/i);
      if (!ttMatch) {
        await waClient.sendMessage(chatId, '❌ Format salah! Masukkan *link profil TikTok*, contoh: https://www.tiktok.com/@username');
        return;
      }
      value = '@' + ttMatch[2]; // hanya username (dengan @)
    }
  }

  // 4. Cek WhatsApp unik (hanya boleh satu user)
  if (fieldNorm === 'whatsapp') {
    const waInUse = await userService.findUserByWhatsApp(value);
    if (waInUse && waInUse.user_id !== user_id) {
      await waClient.sendMessage(chatId, '❌ Nomor WhatsApp ini sudah terdaftar pada user lain.');
      return;
    }
    value = value.replace(/[^0-9]/g, '');
  }

  // 5. Update field
  await userService.updateUserField(user_id, fieldNorm, value);

  await waClient.sendMessage(chatId, `✅ Data ${fieldNorm === 'title' ? 'pangkat' : fieldNorm === 'divisi' ? 'satfung' : fieldNorm} untuk NRP/NIP ${user_id} berhasil diupdate menjadi *${value}*.`);
  return;
}


if (text.toLowerCase().startsWith('mydata#')) {
  const [, user_id] = text.split('#');
  if (!user_id) {
    await waClient.sendMessage(chatId, 'Format salah!\nGunakan: mydata#user_id');
    return;
  }
  try {
    const user = await userService.findUserById(user_id);
    if (!user) {
      await waClient.sendMessage(chatId, `❌ User dengan NRP/NIP ${user_id} tidak ditemukan.`);
      return;
    }
    // Nomor pengirim WA (hanya angka)
    let pengirim = chatId.replace(/[^0-9]/g, '');

    // Jika whatsapp masih null/kosong, binding ke nomor ini
    if (!user.whatsapp || user.whatsapp === '') {
      await userService.updateUserField(user_id, 'whatsapp', pengirim);
      user.whatsapp = pengirim;
    }

    // Jika whatsapp sudah ada, hanya nomor ini yang bisa akses
    if (user.whatsapp !== pengirim) {
      await waClient.sendMessage(chatId, '❌ Hanya WhatsApp yang terdaftar pada user ini yang dapat mengakses data.');
      return;
    }

    // Mapping nama tampilan
    const fieldMap = {
      user_id: 'NRP/NIP',
      nama: 'Nama',
      title: 'Pangkat',
      divisi: 'Satfung',
      jabatan: 'Jabatan',
      status: 'Status',
      whatsapp: 'WhatsApp',
      insta: 'Instagram',
      tiktok: 'TikTok',
      client_id: 'POLRES'
    };

    // Urutan output
    const order = [
      'user_id', 'nama', 'title', 'divisi', 'jabatan', 'status', 'whatsapp', 'insta', 'tiktok', 'client_id'
    ];

    // Compose pesan (tanpa field exception)
    let msgText = `📋 *Data Anda (${user.user_id}):*\n`;
    order.forEach(k => {
      if (k === 'exception') return;
      if (user[k] !== undefined && user[k] !== null) {
        let val = user[k];
        // Label mapping
        let label = fieldMap[k] || k;
        if (k === 'status') {
          val = (val === true || val === 'true') ? 'AKTIF' : 'AKUN DIHAPUS';
        }
        msgText += `*${label}*: ${val}\n`;
      }
    });
    await waClient.sendMessage(chatId, msgText);
  } catch (err) {
    await waClient.sendMessage(chatId, `❌ Gagal mengambil data: ${err.message}`);
  }
  return;
}

// === UPDATE EXCEPTION DAN STATUS USER (ADMIN ONLY) ===
if (
  (text.toLowerCase().startsWith('exception#') ||
    text.toLowerCase().startsWith('status#'))
) {
  // Hanya admin dari .env
  if (!isAdminWhatsApp(chatId)) {
    await waClient.sendMessage(chatId, '❌ Hanya admin yang dapat mengubah data status/exception.');
    return;
  }
  // Format: exception#user_id#true/false  atau status#user_id#true/false
  const [command, user_id, valueRaw] = text.split('#');
  if (
    !user_id ||
    (valueRaw !== 'true' && valueRaw !== 'false')
  ) {
    await waClient.sendMessage(
      chatId,
      `Format salah!\nGunakan: ${command}#user_id#true/false`
    );
    return;
  }
  const field = command.toLowerCase();
  try {
    // Cek user ada?
    const user = await userService.findUserById(user_id);
    if (!user) {
      await waClient.sendMessage(chatId, `❌ User dengan ID ${user_id} tidak ditemukan.`);
      return;
    }
    // Update
    await userService.updateUserField(user_id, field, valueRaw === 'true');
    await waClient.sendMessage(
      chatId,
      `✅ Data *${field}* untuk user ${user_id} berhasil diupdate ke: *${valueRaw === 'true' ? 'true' : 'false'}*`
    );
  } catch (err) {
    await waClient.sendMessage(
      chatId,
      `❌ Gagal update ${field}: ${err.message}`
    );
  }
  return;
}


});

// Helper untuk format nomor ke WhatsApp ID
function formatToWhatsAppId(nohp) {
  let number = nohp.replace(/\D/g, '');
  if (!number.startsWith('62')) number = '62' + number.replace(/^0/, '');
  return `${number}@c.us`;
}


waClient.initialize();

export default waClient;
