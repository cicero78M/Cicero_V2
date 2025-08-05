import cron from 'node-cron';
import waClient from '../service/waService.js';
import { query } from '../db/index.js';
import { getUsersMissingDataByClient } from '../model/userModel.js';
import {
  formatToWhatsAppId,
  safeSendMessage,
  sendWAReport,
  getAdminWAIds,
} from '../utils/waHelper.js';

async function getActiveClients() {
  const res = await query(
    'SELECT client_id, nama FROM clients WHERE client_status = true'
  );
  return res.rows;
}

export async function runCron() {
  try {
    const clients = await getActiveClients();
    const rekap = [];
    for (const client of clients) {
      const users = await getUsersMissingDataByClient(client.client_id);
      for (const user of users) {
        const missing = [];
        if (!user.insta) missing.push('username Instagram');
        if (!user.tiktok) missing.push('username TikTok');
        if (!user.whatsapp) missing.push('registrasi WhatsApp');
        const msg = `Halo ${user.nama}, data Anda belum lengkap: ${missing.join(', ')}. Mohon lengkapi.`;
        if (user.whatsapp) {
          const chatId = formatToWhatsAppId(user.whatsapp);
          await safeSendMessage(waClient, chatId, msg);
        } else {
          rekap.push(`- ${client.nama} - ${user.nama}: ${missing.join(', ')}`);
        }
      }
    }
    if (rekap.length > 0) {
      const report = `User tanpa WhatsApp:\n${rekap.join('\n')}`;
      await sendWAReport(waClient, report, getAdminWAIds());
    }
  } catch (err) {
    console.error('[CRON ABSENSI USER DATA]', err.message);
  }
}

cron.schedule('0 13 * * *', runCron, { timezone: 'Asia/Jakarta' });

export default null;
