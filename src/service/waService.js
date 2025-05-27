import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import * as clientService from './clientService.js'; // Ubah path jika diperlukan

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
      // Silakan tambahkan field lain jika ingin input via WA
      const newClient = await clientService.createClient({
        client_id,
        nama,
        client_type: '',
        client_status: true,
        client_insta: {},
        client_insta_status: false,
        client_tiktok: {},
        client_tiktok_status: false,
        client_operator: '',
        client_group: ''
      });

      let dataText = `✅ Data Client *${newClient.client_id}* berhasil ditambah:\n`;
      for (const k in newClient) {
        let v = newClient[k];
        if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
        dataText += `*${k}*: ${v}\n`;
      }
      await waClient.sendMessage(chatId, dataText);

      // Kirim juga ke client_operator jika diisi dan bukan nomor yang sama
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

  // === UPDATE CLIENT ===
  if (text.toLowerCase().startsWith('updateclient#')) {
    const parts = text.split('#');
    if (parts.length < 4) {
      await waClient.sendMessage(chatId, 'Format salah!\nGunakan: updateclient#clientid#key#value');
      return;
    }
    const [, client_id, key, ...valueParts] = parts;
    const value = valueParts.join('#');
    try {
      const updateObj = {};
      if (['client_status', 'client_insta_status', 'client_tiktok_status'].includes(key)) {
        updateObj[key] = value === 'true';
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
});

// Helper untuk format nomor ke WhatsApp ID
function formatToWhatsAppId(nohp) {
  let number = nohp.replace(/\D/g, '');
  if (!number.startsWith('62')) number = '62' + number.replace(/^0/, '');
  return `${number}@c.us`;
}

waClient.initialize();

export default waClient;
