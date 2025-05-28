import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import * as clientService from './clientService.js';
import { getTiktokSecUid } from './tiktokService.js';
import { migrateUsersFromFolder } from './userMigrationService.js';
import { checkGoogleSheetCsvStatus } from './checkGoogleSheetAccess.js';
import { importUsersFromGoogleSheet } from './importUsersFromGoogleSheet.js';
import * as userService from './userService.js';

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


  // === UPDATEUSER: Field IG, TIKTOK, WA (open untuk user, sesuai logika validasi) ===
if (text.toLowerCase().startsWith('updateuser#')) {
  const parts = text.split('#');
  if (parts.length !== 4) {
    await waClient.sendMessage(chatId, 'Format salah!\nGunakan: updateuser#user_id#field#link_profile');
    return;
  }
  const [, user_id, field, rawValue] = parts;
  const allowed = ['insta', 'tiktok', 'whatsapp'];
  if (!allowed.includes(field)) {
    await waClient.sendMessage(chatId, '❌ Field hanya bisa: insta, tiktok, whatsapp');
    return;
  }

  try {
    // Cari data user utama
    const user = await userService.findUserById(user_id);
    if (!user) {
      await waClient.sendMessage(chatId, `❌ User dengan ID ${user_id} tidak ditemukan`);
      return;
    }

    // Nomor pengirim WA
    let pengirim = chatId.replace(/[^0-9]/g, '');

    // === ANTI DUPLIKASI WA
    if (field === 'whatsapp') {
      const waInUse = await userService.findUserByWhatsApp(pengirim);
      if (waInUse && waInUse.user_id !== user_id) {
        await waClient.sendMessage(chatId, '❌ Nomor WhatsApp ini sudah terdaftar pada user lain dan tidak bisa digunakan lagi.');
        return;
      }
      // Hanya pemilik lama/belum terisi yang boleh update
      if (user.whatsapp && user.whatsapp !== pengirim) {
        await waClient.sendMessage(chatId, `❌ WhatsApp hanya bisa diubah oleh nomor ${user.whatsapp}`);
        return;
      }
    }

    // === ANTI DUPLIKASI INSTA
    let value = rawValue.trim();
    if (field === 'insta') {
      const igMatch = value.match(/^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]+)(\/)?(\?|$)/i);
      if (!igMatch) {
        await waClient.sendMessage(chatId, '❌ Format salah! Masukkan *link profil Instagram*, contoh: https://www.instagram.com/username');
        return;
      }
      value = igMatch[2];
      const instaDupe = await userService.findUserByInsta(value);
      if (instaDupe && instaDupe.user_id !== user_id) {
        await waClient.sendMessage(chatId, `❌ Username Instagram *${value}* sudah terdaftar pada user lain.`);
        return;
      }
      // Hanya pemilik WA atau yang belum ada WA yang boleh update
      if (user.whatsapp && user.whatsapp !== pengirim) {
        await waClient.sendMessage(chatId, '❌ Hanya WhatsApp yang terdaftar di user ini yang boleh mengubah data.');
        return;
      }
    }

    // === ANTI DUPLIKASI TIKTOK
    if (field === 'tiktok') {
      const ttMatch = value.match(/^https?:\/\/(www\.)?tiktok\.com\/@([A-Za-z0-9._]+)(\/)?(\?|$)/i);
      if (!ttMatch) {
        await waClient.sendMessage(chatId, '❌ Format salah! Masukkan *link profil TikTok*, contoh: https://www.tiktok.com/@username');
        return;
      }
      value = '@' + ttMatch[2];
      const tiktokDupe = await userService.findUserByTiktok(value);
      if (tiktokDupe && tiktokDupe.user_id !== user_id) {
        await waClient.sendMessage(chatId, `❌ Username TikTok *${value}* sudah terdaftar pada user lain.`);
        return;
      }
      // Hanya pemilik WA atau yang belum ada WA yang boleh update
      if (user.whatsapp && user.whatsapp !== pengirim) {
        await waClient.sendMessage(chatId, '❌ Hanya WhatsApp yang terdaftar di user ini yang boleh mengubah data.');
        return;
      }
    }

    // === AUTO UPDATE WA saat update insta/tiktok dan belum ada WA
    let updateObj = {};
    updateObj[field] = value;
    if ((field === 'insta' || field === 'tiktok') && (!user.whatsapp || user.whatsapp === '')) {
      // Cek duplikasi WA (lagi) sebelum auto assign!
      const waInUse = await userService.findUserByWhatsApp(pengirim);
      if (waInUse && waInUse.user_id !== user_id) {
        await waClient.sendMessage(chatId, '❌ Nomor WhatsApp ini sudah terdaftar pada user lain dan tidak bisa digunakan untuk user ini.');
        return;
      }
      updateObj['whatsapp'] = pengirim;
    }

    // Update database
    for (const k in updateObj) {
      await userService.updateUserField(user_id, k, updateObj[k]);
    }

    let successText = `✅ Data user ${user_id} berhasil diupdate!\n*${field}*: ${value}`;
    if (updateObj['whatsapp'] && field !== 'whatsapp') {
      successText += `\n*whatsapp*: ${pengirim}`;
    }
    await waClient.sendMessage(chatId, successText);

  } catch (err) {
    await waClient.sendMessage(chatId, `❌ Gagal update: ${err.message}`);
  }
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
      await waClient.sendMessage(chatId, `❌ User dengan ID ${user_id} tidak ditemukan.`);
      return;
    }
    let pengirim = chatId.replace(/[^0-9]/g, '');

    // Jika whatsapp masih null/kosong, binding ke nomor ini
    if (!user.whatsapp || user.whatsapp === '') {
      await userService.updateUserField(user_id, 'whatsapp', pengirim);
      user.whatsapp = pengirim;
    }

    // Jika whatsapp sudah ada, hanya yang cocok yang bisa akses
    if (user.whatsapp !== pengirim) {
      await waClient.sendMessage(chatId, '❌ Hanya WhatsApp yang terdaftar pada user ini yang dapat mengakses data.');
      return;
    }

    // Compose data (tanpa field exception)
    let msgText = `📋 *Data Anda (${user_id}):*\n`;
    const order = [
      'user_id', 'nama', 'title', 'divisi', 'jabatan', 'status', 'whatsapp', 'insta', 'tiktok', 'client_id'
    ];
    order.forEach(k => {
      if (k === 'exception') return;
      if (user[k] !== undefined && user[k] !== null) {
        let val = user[k];
        if (k === 'status') {
          val = (val === true || val === 'true') ? 'AKTIF' : 'AKUN DIHAPUS';
        }
        msgText += `*${k}*: ${val}\n`;
      }
    });
    await waClient.sendMessage(chatId, msgText);
  } catch (err) {
    await waClient.sendMessage(chatId, `❌ Gagal mengambil data: ${err.message}`);
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
