import { getAdminWAIds } from "../utils/waHelper";
import waClient from "../utils/waClient.js";

export function sendCronDebug(client_id, msg) {
  const adminWA = getAdminWAIds();
  for (const wa of adminWA)
    waClient
      .sendMessage(wa, `[CRON TIKTOK][${client_id}] ${msg}`)
      .catch(() => {});
  console.log(`[CRON TIKTOK][${client_id}] ${msg}`);
}

export function sendAdminDebug(msg) {
  const adminWA = (process.env.ADMIN_WHATSAPP || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => (n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"));
  for (const wa of adminWA) {
    waClient.sendMessage(wa, `[CICERO DEBUG]\n${msg}`).catch(() => {});
  }
}

    export function sendDebug(msg) {
      const adminWA = (process.env.ADMIN_WHATSAPP || "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => (n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"));
      for (const wa of adminWA)
        waClient.sendMessage(wa, "[DEBUG FETTIKTOK] " + msg).catch(() => {});
      console.log("[DEBUG FETTIKTOK] " + msg);
    }