import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { handleFetchKomentarTiktokBatch } from "../handler/fetchEngagement/fetchCommentTiktok.js";

// Ambil daftar client TikTok aktif
async function getActiveClientsTiktok() {
  const { pool } = await import("../config/db.js");
  const rows = await pool.query(
    "SELECT client_id, nama FROM clients WHERE client_status = true AND client_tiktok_status = true ORDER BY client_id"
  );
  return rows.rows;
}

// CRON: Setiap jam 04:10 sampai 22:10 WIB
cron.schedule(
  "10 4-22 * * *",
  async () => {
    sendDebug({
      tag: "CRON TTK KOMENTAR",
      msg: "Mulai tugas absensi komentar TikTok batch...",
    });
    try {
      const clients = await getActiveClientsTiktok();
      if (!clients.length) {
        sendDebug({
          tag: "CRON TTK KOMENTAR",
          msg: "Tidak ada client TikTok aktif.",
        });
        return;
      }
      for (const client of clients) {
        try {
          sendDebug({
            tag: "CRON TTK KOMENTAR",
            msg: `[client=${client.client_id}] Mulai fetch komentar TikTok...`,
          });
          await handleFetchKomentarTiktokBatch(
            waClient,
            process.env.ADMIN_WHATSAPP,
            client.client_id
          );
          sendDebug({
            tag: "CRON TTK KOMENTAR",
            msg: `[client=${client.client_id}] Selesai fetch komentar TikTok.`,
          });
          // Kirim laporan selesai ke admin
          await Promise.all(
            process.env.ADMIN_WHATSAPP.split(",")
              .map((n) => n.trim())
              .filter(Boolean)
              .map((admin) =>
                waClient.sendMessage(
                  admin.endsWith("@c.us")
                    ? admin
                    : admin.replace(/\D/g, "") + "@c.us",
                  `✅ [CRON] Selesai fetch komentar TikTok untuk ${client.client_id} - ${client.nama}.`
                ).catch(() => {})
              )
          );
        } catch (err) {
          // Kirim error ke admin
          await Promise.all(
            process.env.ADMIN_WHATSAPP.split(",")
              .map((n) => n.trim())
              .filter(Boolean)
              .map((admin) =>
                waClient.sendMessage(
                  admin.endsWith("@c.us")
                    ? admin
                    : admin.replace(/\D/g, "") + "@c.us",
                  `❌ [CRON] Gagal fetch komentar TikTok untuk ${client.client_id}: ${err.message || err}`
                ).catch(() => {})
              )
          );
          sendDebug({
            tag: "CRON TTK KOMENTAR",
            msg: `[client=${client.client_id}] ERROR fetch komentar TikTok: ${err.message || err}`,
          });
        }
      }
      sendDebug({
        tag: "CRON TTK KOMENTAR",
        msg: "SELESAI semua client.",
      });
    } catch (err) {
      sendDebug({
        tag: "CRON TTK KOMENTAR ERROR",
        msg: `[ERROR GLOBAL] ${err.message || err}`,
      });
    }
  },
  {
    timezone: "Asia/Jakarta",
  }
);

export default null;
