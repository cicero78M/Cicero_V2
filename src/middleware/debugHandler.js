// src/utils/debugHelper.js

import waClient from "../service/waService.js";

function parseAdminWA() {
  return (process.env.ADMIN_WHATSAPP || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => (n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"));
}

/**
 * Kirim debug ke admin WhatsApp & console.
 * @param {string} tag - Tag kategori pesan (misal: CRON TIKTOK)
 * @param {string} msg - Pesan yang akan dikirim/log.
 * @param {string} [client_id] - Opsional, client_id untuk prefix (jika ada)
 */
export function sendDebug({ tag = "DEBUG", msg, client_id = "" } = {}) {
  const adminWA = parseAdminWA();
  let prefix = `[${tag}]`;
  if (client_id) prefix += `[${client_id}]`;

  const fullMsg = `${prefix} ${msg}`;
  for (const wa of adminWA) {
    waClient.sendMessage(wa, fullMsg).catch(() => {});
  }
  console.log(fullMsg);
}

// Shorthand untuk kebutuhan umum
export const sendCronDebug = (client_id, msg) =>
  sendDebug({ tag: "CRON TIKTOK", msg, client_id });

export const sendAdminDebug = (msg) =>
  sendDebug({ tag: "CICERO DEBUG", msg });

export const sendTiktokDebug = (msg) =>
  sendDebug({ tag: "TIKTOK", msg });
