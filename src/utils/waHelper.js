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

// Format output data client (untuk WA)
export function formatClientData(obj, title = "") {
  let keysOrder = [
    "client_id",
    "nama",
    "client_type",
    "client_status",
    "client_insta",
    "client_insta_status",
    "client_tiktok",
    "client_tiktok_status",
    "client_operator",
    "client_super",
    "client_group",
    "tiktok_secuid",
  ];
  let dataText = title ? `${title}\n` : "";
  for (const key of keysOrder) {
    if (key in obj) {
      let v = obj[key];
      if (typeof v === "object" && v !== null) v = JSON.stringify(v);
      dataText += `*${key}*: ${v}\n`;
    }
  }
  Object.keys(obj).forEach((key) => {
    if (!keysOrder.includes(key)) {
      let v = obj[key];
      if (typeof v === "object" && v !== null) v = JSON.stringify(v);
      dataText += `*${key}*: ${v}\n`;
    }
  });
  return dataText;
}

const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || "")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

export function getAdminWAIds() {
  return ADMIN_WHATSAPP.map((n) =>
    n.endsWith("@c.us") ? n : n.replace(/[^0-9]/g, "") + "@c.us"
  );
}

// Normalisasi nomor admin ke awalan 0 (tanpa @c.us)
export function getAdminWANumbers() {
  const numbers = ADMIN_WHATSAPP.map((n) => {
    let num = String(n).replace(/[^0-9]/g, "");
    if (num.startsWith("62")) num = "0" + num.slice(2);
    if (!num.startsWith("0")) num = "0" + num;
    return num;
  });
  return Array.from(new Set(numbers));
}