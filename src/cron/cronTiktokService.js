import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import { pool } from "../config/db.js";
import waClient from "../service/waService.js";
import { handleFetchKomentarTiktokBatch } from "../handler/fetchEngagement/fetchCommentTiktok.js";
import { sendDebug } from "../middleware/debugHandler.js";

// Fungsi ambil client TikTok aktif
async function getActiveClientsTiktok() {
  const rows = await pool.query(
    "SELECT client_id, nama FROM clients WHERE client_status = true AND client_tiktok_status = true ORDER BY client_id"
  );
  return rows.rows;
}

// Jadwalkan cron: misal tiap jam 04 lewat 10 menit pagi-sore
cron.schedule("10 4-22 * * *", async () => {
  sendDebug({ tag: "CRON TTK KOMENTAR", msg: "Mulai absensi komentar TikTok batch..." });

  try {
    const clients = await getActiveClientsTiktok();
    if (!clients.length) {
      sendDebug({ tag: "CRON TTK KOMENTAR", msg: "Tidak ada client TikTok aktif." });
      return;
    }

    for (const client of clients) {
      await waClient.sendMessage(
        process.env.ADMIN_WHATSAPP, // bisa array jika perlu
        `⏳ [CRON] Mulai fetch komentar TikTok untuk ${client.client_id} - ${client.nama}...`
      );
      try {
        await handleFetchKomentarTiktokBatch(waClient, process.env.ADMIN_WHATSAPP, client.client_id);
        await waClient.sendMessage(
          process.env.ADMIN_WHATSAPP,
          `✅ [CRON] Selesai fetch komentar TikTok untuk ${client.client_id}.`
        );
      } catch (err) {
        await waClient.sendMessage(
          process.env.ADMIN_WHATSAPP,
          `❌ [CRON] Gagal fetch komentar TikTok untuk ${client.client_id}: ${err.message || err}`
        );
        sendDebug({ tag: "CRON TTK KOMENTAR", msg: `Error ${client.client_id}: ${err.message || err}` });
      }
    }
    sendDebug({ tag: "CRON TTK KOMENTAR", msg: "SELESAI semua client." });
  } catch (err) {
    sendDebug({ tag: "CRON TTK KOMENTAR ERROR", msg: err.message || err });
  }
});
