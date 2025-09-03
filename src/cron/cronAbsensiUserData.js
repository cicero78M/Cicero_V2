import cron from 'node-cron';
import waClient from '../service/waService.js';
import { query } from '../db/index.js';
import { getUsersMissingDataByClient, getClientsByRole } from '../model/userModel.js';
import {
  formatToWhatsAppId,
  safeSendMessage,
  sendWAReport,
  getAdminWAIds,
} from '../utils/waHelper.js';

async function getActiveClients() {
  const clientIds = await getClientsByRole('ditbinmas');
  const ids = Array.from(new Set(['ditbinmas', ...clientIds]));
  if (ids.length === 0) return [];
  const res = await query(
    `SELECT client_id, nama, client_operator, client_type
     FROM clients
     WHERE client_status = true AND LOWER(client_id) = ANY($1::text[])`,
    [ids.map((id) => id.toLowerCase())]
  );
  return res.rows;
}

function sortClients(clients) {
  return clients.sort((a, b) => {
    const idA = a.client_id?.toUpperCase();
    const idB = b.client_id?.toUpperCase();
    if (idA === 'DITBINMAS') return -1;
    if (idB === 'DITBINMAS') return 1;
    return a.nama.localeCompare(b.nama);
  });
}

export async function runCron() {
  try {
    const clients = sortClients(await getActiveClients());
    const adminRekap = [];
    let idx = 1;
    for (const client of clients) {
      const users = await getUsersMissingDataByClient(client.client_id);
      const clientRekap = [];
      for (const user of users) {
        const missing = [];
        if (!user.insta) missing.push('username Instagram');
        if (!user.tiktok) missing.push('username TikTok');
        if (!user.whatsapp) missing.push('registrasi WhatsApp');
        const msg = `Halo ${user.nama}, data Anda belum lengkap: ${missing.join(', ')}. Mohon lengkapi.`;
        if (user.whatsapp) {
          const chatId = formatToWhatsAppId(user.whatsapp);
          await safeSendMessage(waClient, chatId, msg);
          await new Promise((resolve) => setTimeout(resolve, 10000)); // Delay 10 detik
        }

        const reasons = [];
        if (!user.whatsapp) reasons.push('Belum Registrasi Whatsapp');
        if (!user.insta) reasons.push('Instagram Kosong');
        if (!user.tiktok) reasons.push('Tiktok Kosong');
        const line = `- ${user.nama} (${user.user_id}): ${reasons.join(', ')}`;
        clientRekap.push(line);
      }
      if (clientRekap.length > 0) {
        if (client.client_operator) {
          const report = `Assalamualaikum,\nBerikut rekap data absensi user yang belum lengkap:\n${clientRekap.join('\n')}`;
          const operatorId = formatToWhatsAppId(client.client_operator);
          await sendWAReport(waClient, report, operatorId);
        }
        adminRekap.push(`${idx}. ${client.nama}`);
        adminRekap.push(...clientRekap);
        idx += 1;
      }
    }
    if (adminRekap.length > 0) {
      const report = `Assalamualaikum,\nBerikut rekap data absensi user yang belum lengkap:\n${adminRekap.join('\n')}`;
      await sendWAReport(waClient, report, getAdminWAIds());
    }
  } catch (err) {
    console.error('[CRON ABSENSI USER DATA]', err.message);
  }
}

cron.schedule('0 6 * * *', runCron, { timezone: 'Asia/Jakarta' });

export default null;
