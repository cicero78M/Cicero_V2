// src/utils/debugHelper.js

import waClient from "../service/waService.js";

// Helper: stringifier aman
function safeStringify(obj) {
  try {
    if (typeof obj === "string") return obj;
    // Hindari circular structure error
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    });
  } catch {
    // Jika gagal, fallback ke .toString() atau static '[Object]'
    try {
      return obj && obj.toString ? obj.toString() : "[Object]";
    } catch {
      return "[Object]";
    }
  }
}

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
 * @param {string|object} msg - Pesan yang akan dikirim/log.
 * @param {string} [client_id] - Opsional, client_id untuk prefix (jika ada)
 */
export function sendDebug({ tag = "DEBUG", msg, client_id = "" } = {}) {
  // **Proteksi circular object**
  let safeMsg;
  try {
    if (typeof msg === "string") {
      safeMsg = msg;
    } else {
      // Buat Set baru setiap pemanggilan agar seen-nya reset
      const seen = new WeakSet();
      safeMsg = JSON.stringify(msg, (key, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return "[Circular]";
          seen.add(value);
        }
        return value;
      });
    }
  } catch {
    safeMsg = (msg && msg.toString) ? msg.toString() : "[Object]";
  }

  const adminWA = parseAdminWA();
  let prefix = `[${tag}]`;
  if (client_id) prefix += `[${client_id}]`;

  const fullMsg = `${prefix} ${safeMsg}`;
  for (const wa of adminWA) {
    waClient.sendMessage(wa, fullMsg).catch(() => {});
  }
  console.log(fullMsg);
}

// Shorthand untuk kebutuhan umum
export const sendCronDebug = (client_id, msg) =>
  sendDebug({ tag: "CRON", msg, client_id });

export const sendAdminDebug = (msg) =>
  sendDebug({ tag: "CICERO", msg });

export const sendTiktokDebug = (msg) =>
  sendDebug({ tag: "REGULAR", msg });
