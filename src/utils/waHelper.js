// src/utils/waHelper.js
import dotenv from 'dotenv';
dotenv.config();

export function getAdminWhatsAppList() {
  return (process.env.ADMIN_WHATSAPP || '')
    .split(',')
    .map(s => s.trim())
    .filter(wid => wid.endsWith('@c.us') && wid.length > 10);
}

export async function sendWAReport(waClient, message, chatIds = null) {
  const targets = chatIds
    ? (Array.isArray(chatIds) ? chatIds : [chatIds])
    : getAdminWhatsAppList();
  for (const target of targets) {
    if (!target || !target.endsWith('@c.us')) {
      console.warn(`[SKIP WA] Invalid wid: ${target}`);
      continue;
    }
    try {
      await waClient.sendMessage(target, message);
      console.log(`[WA CRON] Sent WA to ${target}: ${message.substring(0, 64)}...`);
    } catch (err) {
      console.error(`[WA CRON] ERROR send WA to ${target}:`, err.message);
    }
  }
}

// Cek apakah nomor WhatsApp adalah admin
export function isAdminWhatsApp(number) {
  const adminNumbers = (process.env.ADMIN_WHATSAPP || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => (n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"));
  return adminNumbers.includes(number);
}

// Konversi nomor ke WhatsAppID (xxxx@c.us)
export function formatToWhatsAppId(nohp) {
  let number = nohp.replace(/\D/g, "");
  if (!number.startsWith("62")) number = "62" + number.replace(/^0/, "");
  return `${number}@c.us`;
}