import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import * as clientService from './clientService.js'; // Ubah path jika perlu
import { getTiktokSecUid } from './tiktokService.js'; // Pastikan ada fungsi ini

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
        client_insta: '',      // string kosong
        client_insta_status: false,
        client_tiktok: '',     // string kosong
        client_tiktok_status: false,
        client_operator: '',
        client_group: '',
        tiktok_secUid: ''
      });

      let dataText = `✅ Data Client *${newClient.client_id}* berhasil ditambah:\n`;
      for (const k in newClient) {
        let v = newClient[k];
        if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
        dataText += `*${k}*: ${v}\n`;
      }
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
          let dataText = `✅ tiktok_secUid untuk client *${client_id}* berhasil diupdate dari username *@${username}*:\n\n*secUid*: ${secUid}\n\n*Data Terbaru:*\n`;
          for (const k in updated) {
            let v = updated[k];
            if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
            dataText += `*${k}*: ${v}\n`;
          }
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
          let dataText = `✅ Data Client *${client_id}* berhasil diupdate:\n`;
          for (const k in updated) {
            let v = updated[k];
            if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
            dataText += `*${k}*: ${v}\n`;
          }
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
        let dataText = `ℹ️ Info Data Client *${client_id}*:\n`;
        for (const k in client) {
          let v = client[k];
          if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
          dataText += `*${k}*: ${v}\n`;
        }
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
        let dataText = `🗑️ Client *${client_id}* berhasil dihapus!\nData sebelumnya:\n`;
        for (const k in removed) {
          let v = removed[k];
          if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
          dataText += `*${k}*: ${v}\n`;
        }
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
updateclient#BOJONEGORO#client_operator#+628123456789
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
