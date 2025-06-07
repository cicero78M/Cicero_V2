import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { fetchAndStoreTiktokContent } from "../handler/fetchPost/tiktokFetchPost.js";
import { handleFetchKomentarTiktokBatch } from "../handler/fetchEngagement/fetchCommentTiktok.js";
import { absensiKomentarTiktokAkumulasi50 } from "../handler/fetchAbsensi/tiktok/absensiKomentarTiktok.js";

// Helper: ambil client TikTok aktif lengkap data
async function getActiveClientsTiktok() {
  const { pool } = await import("../config/db.js");
  const rows = await pool.query(
    `SELECT client_id, nama, client_operator, client_super, client_group
     FROM clients
     WHERE client_status = true AND client_tiktok_status = true
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
  "00 15,18,21 * * *",
  async () => {
    try {
      const clients = await getActiveClientsTiktok();
      let fetchSummary = {};

      // 1. Fetch post TikTok hari ini untuk setiap client
      for (const client of clients) {
        try {
          await fetchAndStoreTiktokContent(client.client_id);
          fetchSummary[client.client_id] = "OK";
        } catch (e) {
          fetchSummary[client.client_id] = e.message;
        }
      }

      // DEBUG: ringkasan fetch post, hanya ke admin
      let debugMsg = `[CRON TIKTOK] Ringkasan fetch TikTok\nTanggal: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}\n`;
      Object.entries(fetchSummary).forEach(([client, status]) => {
        debugMsg += `- ${client} : ${status}\n`;
      });
      for (const admin of getAdminWAIds()) {
        await waClient.sendMessage(admin, debugMsg).catch(() => {});
      }

      // 2. FETCH KOMENTAR TikTok per client
      for (const client of clients) {
        try {
          await handleFetchKomentarTiktokBatch(null, null, client.client_id);
        } catch (e) {
          for (const admin of getAdminWAIds()) {
            await waClient.sendMessage(admin, `[CRON TIKTOK][${client.client_id}] ERROR fetch komentar TikTok: ${e.message}`).catch(() => {});
          }
        }

        // 3. ABSENSI KOMENTAR TikTok ("belum", akumulasi 50%)
        try {
          const msg = await absensiKomentarTiktokAkumulasi50(client.client_id, { mode: "belum" });
          if (msg && msg.length > 0 && !/Belum melaksanakan: \*0\*/.test(msg)) {
            for (const wa of getAllNotifRecipients(client)) {
              await waClient.sendMessage(wa, msg).catch(() => {});
            }
          } else {
            for (const admin of getAdminWAIds()) {
              await waClient.sendMessage(admin, `[CRON TIKTOK][${client.client_id}] Semua user sudah komentar, tidak ada laporan belum.`).catch(() => {});
            }
          }
        } catch (e) {
          for (const admin of getAdminWAIds()) {
            await waClient.sendMessage(admin, `[CRON TIKTOK][${client.client_id}] ERROR absensi TikTok: ${e.message}`).catch(() => {});
          }
        }
      }
    } catch (err) {
      for (const admin of getAdminWAIds()) {
        await waClient.sendMessage(admin, `[CRON TIKTOK][GLOBAL ERROR] ${err.message || err}`).catch(() => {});
      }
    }
  },
  { timezone: "Asia/Jakarta" }
);

export default null;
