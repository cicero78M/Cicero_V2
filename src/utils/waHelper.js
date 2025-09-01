// src/utils/waHelper.js
import dotenv from 'dotenv';
import mime from 'mime-types';
import path from 'path';
dotenv.config();

const spreadsheetMimeTypes = {
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const defaultMimeType = spreadsheetMimeTypes['.xlsx'];

export function getAdminWhatsAppList() {
  return (process.env.ADMIN_WHATSAPP || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(wid => (wid.endsWith('@c.us') ? wid : wid.replace(/\D/g, '') + '@c.us'))
    .filter(wid => wid.length > 10);
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
      console.log(
        `[WA CRON] Sent WA to ${target}: ${message.substring(0, 64)}...`
      );
    } catch (err) {
      console.error(`[WA CRON] ERROR send WA to ${target}:`, err.message);
    }
  }
}

export async function sendWAFile(
  waClient,
  buffer,
  filename,
  chatIds = null,
  mimeType
) {
  const targets = chatIds
    ? Array.isArray(chatIds)
      ? chatIds
      : [chatIds]
    : getAdminWhatsAppList();
  const ext = path.extname(filename).toLowerCase();
  const resolvedMimeType =
    mimeType || spreadsheetMimeTypes[ext] || mime.lookup(filename) || defaultMimeType;
  for (const target of targets) {
    if (!target || !target.endsWith('@c.us')) {
      console.warn(`[SKIP WA] Invalid wid: ${target}`);
      continue;
    }
    try {
      let chatId = target;
      if (typeof waClient.onWhatsApp === 'function') {
        const [result] = await waClient.onWhatsApp(target);
        if (!result?.exists) {
          console.warn(`[SKIP WA] Unregistered wid: ${target}`);
          continue;
        }
        chatId = result.jid || chatId;
      }
      await waClient.sendMessage(chatId, {
        document: buffer,
        mimetype: resolvedMimeType,
        fileName: filename,
      });
      console.log(`[WA CRON] Sent file to ${target}: ${filename}`);
    } catch (err) {
      console.error(`[WA CRON] ERROR send file to ${target}:`, err.message);
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
  const normalized =
    typeof number === "string"
      ? number.endsWith("@c.us")
        ? number
        : number.replace(/\D/g, "") + "@c.us"
      : "";
  return adminNumbers.includes(normalized);
}

// Konversi nomor ke WhatsAppID (xxxx@c.us)
export function formatToWhatsAppId(nohp) {
  let number = nohp.replace(/\D/g, "");
  if (!number.startsWith("62")) number = "62" + number.replace(/^0/, "");
  return `${number}@c.us`;
}

// Normalisasi nomor WhatsApp ke awalan 62 tanpa suffix @c.us
export function normalizeWhatsappNumber(nohp) {
  let number = String(nohp).replace(/\D/g, "");
  if (!number.startsWith("62")) number = "62" + number.replace(/^0/, "");
  return number;
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
    "client_amplify_status",
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

// Send WhatsApp message with basic error handling
async function waitUntilReady(waClient, timeout = 10000) {
  if (!waClient) return false;

  try {
    if (typeof waClient.isReady === 'function') {
      const ok = await waClient.isReady();
      if (ok) return true;
    } else if (typeof waClient.getState === 'function') {
      const state = await waClient.getState();
      if (state === 'CONNECTED' || state === 'open') return true;
    }
  } catch {
    // ignore and fall back to event listener
  }

  if (typeof waClient.once !== 'function') return false;
  return new Promise((resolve) => {
    const onReady = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      waClient.off?.('ready', onReady);
      resolve(false);
    }, timeout);
    waClient.once('ready', onReady);
  });
}

export async function safeSendMessage(waClient, chatId, message, options = {}) {
  try {
    const ready = await waitUntilReady(waClient);
    if (!ready) {
      console.warn(`[WA] Client not ready, cannot send message to ${chatId}`);
      return;
    }
    await waClient.sendMessage(chatId, message, options);
    console.log(
      `[WA] Sent message to ${chatId}: ${message.substring(0, 64)}`
    );
  } catch (err) {
    console.error(`[WA] Failed to send message to ${chatId}:`, err.message);
  }
}
