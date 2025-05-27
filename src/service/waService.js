import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import * as clientService from './clientService.js'; // Ubah path jika perlu
import { getTiktokSecUid } from './tiktokService.js'; // Pastikan ada fungsi ini

import { migrateUsersFromFolder } from './service/userMigrationService.js';



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

// === Helper untuk urutan field ===
function formatClientData(obj, title = '') {
  let keysOrder = [
    'client_id',
    'nama',
    'client_type',
    'client_status',
    'client_insta',
    'client_insta_status',
    'client_tiktok',
    'client_tiktok_status',
    'client_operator',
    'client_super',      // <= client_super di bawah client_operator!
    'client_group',
    'tiktok_secUid'
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

waClient.on('message', async (msg) => {
  const chatId = msg.from;
  const text = msg.body.trim();

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
});



// Helper untuk format nomor ke WhatsApp ID
function formatToWhatsAppId(nohp) {
  let number = nohp.replace(/\D/g, '');
  if (!number.startsWith('62')) number = '62' + number.replace(/^0/, '');
  return `${number}@c.us`;
}

waClient.initialize();

export default waClient;
