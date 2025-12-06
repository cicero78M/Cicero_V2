import { scheduleCronJob } from "../utils/cronScheduler.js";
import dotenv from "dotenv";
dotenv.config();

import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";
import { absensiLikes } from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import { absensiLink } from "../handler/fetchabsensi/link/absensiLinkAmplifikasi.js";
import waClient from "../service/waService.js";

// Helper: ambil client IG aktif lengkap data
async function getActiveClientsIG() {
  const { query } = await import("../db/index.js");
  const rows = await query(
    `SELECT client_id, nama, client_operator, client_super, client_group,
            client_insta_status, client_amplify_status
     FROM clients
     WHERE client_status = true
       AND (client_insta_status = true OR client_amplify_status = true)
       AND client_type = 'ORG'
     ORDER BY client_id`
  );
  return rows.rows;
}

// Helper: format WhatsApp ID (biar aman)
function toWAid(id) {
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith("@c.us") || trimmed.endsWith("@g.us")) return trimmed;
  return trimmed.replace(/\D/g, "") + "@c.us";
}
function getAdminWAIds() {
  return (process.env.ADMIN_WHATSAPP || "")
    .split(",")
    .map(n => n.trim())
    .filter(Boolean)
    .map(toWAid)
    .filter(Boolean);
}
function getAllNotifRecipients(client) {
  // Semua target (unik, valid, tidak double)
  const result = new Set();
  getAdminWAIds().forEach(n => result.add(n));
  [client.client_operator, client.client_super, client.client_group]
    .map(toWAid)
    .filter(Boolean)
    .forEach(n => result.add(n));
  return Array.from(result);
}

const JOB_KEY = "./src/cron/cronInstaLaphar.js";

scheduleCronJob(
  JOB_KEY,
  "10 15,18,21 * * *",
  async () => {
    // Step 1: Fetch post IG
    try {
      const clients = await getActiveClientsIG();
      const keys = ["code", "caption", "like_count", "taken_at", "comment_count"];
      let fetchSummary = {};

      for (const client of clients) {
        try {
          await fetchAndStoreInstaContent(keys, null, null, client.client_id);
          fetchSummary[client.client_id] = "OK";
        } catch (e) {
          fetchSummary[client.client_id] = e.message;
        }
      }

      // DEBUG: ringkasan fetch post, hanya ke admin
      let debugMsg = `[CRON IG] Ringkasan fetch Instagram\nTanggal: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}\n`;
      Object.entries(fetchSummary).forEach(([client, status]) => {
        debugMsg += `- ${client} : ${status}\n`;
      });
      for (const admin of getAdminWAIds()) {
        await waClient.sendMessage(admin, debugMsg).catch(() => {});
      }

      // Step 2: FETCH LIKES IG dan ABSENSI LIKES (belum) serta rekap amplifikasi
      for (const client of clients) {
        if (client.client_insta_status) {
          // === FETCH LIKES IG ===
          try {
            await handleFetchLikesInstagram(null, null, client.client_id);
          } catch (e) {
            for (const admin of getAdminWAIds()) {
              await waClient
                .sendMessage(admin, `[CRON IG][${client.client_id}] ERROR fetch likes IG: ${e.message}`)
                .catch(() => {});
            }
          }

          // === ABSENSI LIKES IG (BELUM) ===
          try {
            const msg = await absensiLikes(client.client_id, { mode: "belum" });
            if (msg && msg.length > 0 && !/Belum melaksanakan: \*0\*/.test(msg)) {
              for (const wa of getAllNotifRecipients(client)) {
                await waClient.sendMessage(wa, msg).catch(() => {});
              }
            } else {
              for (const admin of getAdminWAIds()) {
                await waClient
                  .sendMessage(admin, `[CRON IG][${client.client_id}] Semua user sudah like, tidak ada laporan belum.`)
                  .catch(() => {});
              }
            }
          } catch (e) {
            for (const admin of getAdminWAIds()) {
              await waClient
                .sendMessage(admin, `[CRON IG][${client.client_id}] ERROR absensi IG: ${e.message}`)
                .catch(() => {});
            }
          }
        }

        if (client.client_amplify_status) {
          // === ABSENSI AMPLIFIKASI ===
          try {
            const msgLink = await absensiLink(client.client_id, { mode: "belum" });
            if (msgLink && msgLink.length > 0 && !/Belum melaksanakan: \*0\*/.test(msgLink)) {
              for (const wa of getAllNotifRecipients(client)) {
                await waClient.sendMessage(wa, msgLink).catch(() => {});
              }
            }
          } catch (e) {
            for (const admin of getAdminWAIds()) {
              await waClient
                .sendMessage(admin, `[CRON IG][${client.client_id}] ERROR absensi amplifikasi: ${e.message}`)
                .catch(() => {});
            }
          }
        }
      }
    } catch (err) {
      for (const admin of getAdminWAIds()) {
        await waClient.sendMessage(admin, `[CRON IG][GLOBAL ERROR] ${err.message || err}`).catch(() => {});
      }
    }
  },
  { timezone: "Asia/Jakarta" }
);

export default null;
