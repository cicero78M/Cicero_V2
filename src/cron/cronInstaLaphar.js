import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import { fetchAndStoreInstaContent } from "../handler/fetchPost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchEngagement/fetchLikesInstagram.js";
import { absensiLikes } from "../handler/fetchAbsensi/insta/absensiLikesInsta.js";
import waClient from "../service/waService.js";

// Helper: ambil client IG aktif lengkap data
async function getActiveClientsIG() {
  const { pool } = await import("../config/db.js");
  const rows = await pool.query(
    `SELECT client_id, nama, client_operator, client_super, client_group
     FROM clients
     WHERE client_status = true AND client_insta_status = true
     ORDER BY client_id`
  );
  return rows.rows;
}

// Helper: format WhatsApp ID (biar aman)
function toWAid(nomor) {
  if (!nomor || typeof nomor !== "string") return null;
  const no = nomor.trim();
  if (!no) return null;
  if (no.endsWith("@c.us")) return no;
  return no.replace(/\D/g, "") + "@c.us";
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

cron.schedule(
  "05 17,18,21 * * *",
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

      // Step 2: FETCH LIKES IG + ABSENSI LIKES ("belum" saja, broadcast ke semua target)
      for (const client of clients) {
        // === FETCH LIKES IG ===
        try {
          await handleFetchLikesInstagram(null, null, client.client_id);
        } catch (e) {
          for (const admin of getAdminWAIds()) {
            await waClient.sendMessage(admin, `[CRON IG][${client.client_id}] ERROR fetch likes IG: ${e.message}`).catch(() => {});
          }
        }

        // === ABSENSI LIKES IG (BELUM) ===
        try {
          const msg = await absensiLikes(client.client_id, { mode: "belum" });
          if (msg && msg.length > 0 && !/Belum melaksanakan: \*0\*/.test(msg)) {
            // Kirim ke semua penerima: admin, operator, super, group (unik)
            for (const wa of getAllNotifRecipients(client)) {
              await waClient.sendMessage(wa, msg).catch(() => {});
            }
          } else {
            for (const admin of getAdminWAIds()) {
              await waClient.sendMessage(admin, `[CRON IG][${client.client_id}] Semua user sudah like, tidak ada laporan belum.`).catch(() => {});
            }
          }
        } catch (e) {
          for (const admin of getAdminWAIds()) {
            await waClient.sendMessage(admin, `[CRON IG][${client.client_id}] ERROR absensi IG: ${e.message}`).catch(() => {});
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
