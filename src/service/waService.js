import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import * as clientService from './clientService.js'; // Path sesuaikan jika perlu

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

// Handler pesan masuk WA
waClient.on('message', async (msg) => {
  const chatId = msg.from;
  const text = msg.body.trim();

  // ADD NEW CLIENT
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
        client_insta: {},
        client_insta_status: false,
        client_tiktok: {},
        client_tiktok_status: false,
        client_operator: '',
        client_group: ''
      });
      // RESPONSE KE PENGIRIM!
      await waClient.sendMessage(chatId, `✅ Client berhasil ditambah:\nID: ${newClient.client_id}\nNama: ${newClient.nama}`);
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal tambah client: ${err.message}`);
    }
    return;
  }

  // UPDATE CLIENT
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
        await waClient.sendMessage(chatId, `✅ Client *${client_id}* updated:\n*${key}* → ${value}`);
      } else {
        await waClient.sendMessage(chatId, `❌ Client dengan ID ${client_id} tidak ditemukan!`);
      }
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal update client: ${err.message}`);
    }
    return;
  }
});

waClient.initialize();

export default waClient;
