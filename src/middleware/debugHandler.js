// src/middleware/debugHandler.js

import waClient, { waReady } from "../service/waService.js";

// Helper: stringifier aman untuk circular object
function safeStringify(obj) {
  try {
    if (typeof obj === "string") return obj;
    const seen = new WeakSet(); // PENTING: harus baru setiap pemanggilan!
    return JSON.stringify(obj, function (key, value) {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    });
  } catch {
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
  let safeMsg = typeof msg === "string" ? msg : safeStringify(msg);

  const adminWA = parseAdminWA();
  let prefix = `[${tag}]`;
  if (client_id) prefix += `[${client_id}]`;

  const fullMsg = `${prefix} ${safeMsg}`;
  if (waReady) {
    for (const wa of adminWA) {
      waClient.sendMessage(wa, fullMsg).catch(() => {});
    }
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
