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
    'SELECT client_id, nama, client_operator FROM clients WHERE client_status = true'
  );
  return res.rows;
}

export async function runCron() {
  try {
    const clients = await getActiveClients();
    const adminRekap = [];
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
        const line = `- ${user.nama}: ${reasons.join(', ')}`;
        clientRekap.push(line);
        adminRekap.push(`- ${client.nama} ${line}`);
      }
      if (clientRekap.length > 0 && client.client_operator) {
        const report = `Assalamualaikum,\nBerikut rekap data absensi user yang belum lengkap:\n${clientRekap.join('\n')}`;
        const operatorId = formatToWhatsAppId(client.client_operator);
        await sendWAReport(waClient, report, operatorId);
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

cron.schedule('0 13 * * *', runCron, { timezone: 'Asia/Jakarta' });

export default null;
