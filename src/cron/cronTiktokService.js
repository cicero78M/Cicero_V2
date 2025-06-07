import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { fetchAndStoreTiktokContent } from "../handler/fetchPost/tiktokFetchPost.js";
import { handleFetchKomentarTiktokBatch } from "../handler/fetchEngagement/fetchCommentTiktok.js";
import { absensiKomentar } from "../handler/fetchAbsensi/tiktok/absensiKomentarTiktok.js";

// Helper ambil client TikTok aktif
async function getActiveClientsTiktok() {
  const { pool } = await import("../config/db.js");
  const rows = await pool.query(
    "SELECT client_id, nama FROM clients WHERE client_status = true AND client_tiktok_status = true ORDER BY client_id"
  );
  return rows.rows;
}

// Format nomor WA admin
function getAdminWAIds() {
  return (process.env.ADMIN_WHATSAPP || "")
    .split(",")
    .map(n => n.trim())
    .filter(Boolean)
    .map(n => (n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"));
}

// Jadwalkan cron tiap jam 06:15 - 20:15 WIB
cron.schedule(
  "55 6-20 * * *",
  async () => {
    sendDebug({
      tag: "CRON TTK",
      msg: "Mulai tugas fetch TikTok, fetch komentar, absensi komentar...",
    });

    try {
      const clients = await getActiveClientsTiktok();

      // Step 1: Fetch Post TikTok Hari Ini (semua client aktif)
      let fetchSummary = {};
      for (const client of clients) {
        try {
          await fetchAndStoreTiktokContent(client.client_id);
          fetchSummary[client.client_id] = "OK";
          sendDebug({
            tag: "CRON TTK",
            msg: `[client=${client.client_id}] Selesai fetch TikTok.`,
          });
        } catch (err) {
          fetchSummary[client.client_id] = err.message;
          sendDebug({
            tag: "CRON TTK",
            msg: `[client=${client.client_id}] ERROR fetch TikTok: ${err.message}`,
          });
        }
      }
      // Kirim ringkasan fetch TikTok
      let summaryMsg = `[CRON TTK] Ringkasan fetch TikTok\nTanggal: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}\n`;
      Object.entries(fetchSummary).forEach(([cid, status]) => {
        summaryMsg += `- ${cid} : ${status}\n`;
      });
      sendDebug({
        tag: "CRON TTK",
        msg: summaryMsg,
      });

      // Step 2: Fetch Komentar TikTok (dan hanya username!)
      for (const client of clients) {
        try {
          sendDebug({
            tag: "CRON TTK",
            msg: `[client=${client.client_id}] Mulai fetch komentar TikTok...`,
          });
          await handleFetchKomentarTiktokBatch(null, null, client.client_id);
          sendDebug({
            tag: "CRON TTK",
            msg: `[client=${client.client_id}] Selesai fetch komentar TikTok.`,
          });
        } catch (err) {
          sendDebug({
            tag: "CRON TTK",
            msg: `[client=${client.client_id}] ERROR fetch komentar TikTok: ${err.message}`,
          });
        }
      }

      // Step 3: Absensi Komentar TikTok ("belum" saja, kirim ke admin WA)
      for (const client of clients) {
        try {
          // Hanya mode: "belum"
          const msg = await absensiKomentar(client.client_id, { mode: "belum" });
          if (msg && msg.length > 0 && !/Belum melaksanakan: \*0\*/.test(msg)) {
            sendDebug({
              tag: "CRON TTK",
              msg: `[client=${client.client_id}] Absensi komentar TTK (BELUM) akan dikirim ke admin.`,
            });
            // Kirim ke semua admin WhatsApp
            await Promise.all(
              getAdminWAIds().map(admin =>
                waClient.sendMessage(admin, msg).catch(() => {})
              )
            );
          } else {
            sendDebug({
              tag: "CRON TTK",
              msg: `[client=${client.client_id}] Semua user sudah komentar, tidak ada laporan belum dikirim.`,
            });
          }
        } catch (err) {
          sendDebug({
            tag: "CRON TTK",
            msg: `[client=${client.client_id}] ERROR absensi TTK: ${err.message}`,
          });
        }
      }

      sendDebug({
        tag: "CRON TTK",
        msg: "Laporan absensi komentar (belum) selesai dikirim ke admin.",
      });
    } catch (err) {
      sendDebug({
        tag: "CRON TTK",
        msg: `[ERROR GLOBAL] ${err.message || err}`,
      });
    }
  },
  {
    timezone: "Asia/Jakarta",
  }
);

export default null;
