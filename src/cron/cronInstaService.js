// src/service/cronService.js

import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import { fetchAndStoreInstaContent } from "../service/instaFetchService.js";
import waClient from "../service/waService.js";

import { getActiveClientsIG, absensiLikesAkumulasiBelum, rekapLikesIG } from "../handler/instaHandler.js";
import { sendDebug } from "../middleware/debugHandler.js";

cron.schedule(
  "40 6-22 * * *",
  async () => {
    sendDebug({
      tag: "CRON IG",
      msg: "Mulai tugas fetchInsta & absensiLikes akumulasi belum...",
    });
    try {
      const clients = await getActiveClientsIG();
      const keys = [
        "code",
        "caption",
        "like_count",
        "taken_at",
        "comment_count",
      ];
      const fetchSummary = await fetchAndStoreInstaContent(keys);

      let debugMsg = `[CRON IG] Ringkasan fetch Instagram\n`;
      debugMsg += `Tanggal: ${new Date().toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      })}\n`;
      if (fetchSummary && typeof fetchSummary === "object") {
        Object.entries(fetchSummary).forEach(([client, stat]) => {
          debugMsg += `Client: ${client}\n  - Jumlah post hari ini: ${
            stat.count || 0
          }\n`;
          if (stat.error) debugMsg += `  - Error: ${stat.error}\n`;
        });
      } else {
        debugMsg += "Fetch selesai (tidak ada summary detail).";
      }
      sendDebug({
        tag: "CRON IG",
        msg: debugMsg,
      });

      for (const client of clients) {
        // --- Rekap Likes IG ---
        try {
          const rekapMsg = await rekapLikesIG(client.client_id);
          if (rekapMsg) {
            sendDebug({
              tag: "CRON IG",
              msg: `[client=${client.client_id}] Rekap likes IG akan dikirim ke admin.`,
            });
            // KIRIM KE ADMIN, BUKAN KE CLIENT
            await Promise.all(
              process.env.ADMIN_WHATSAPP.split(",")
                .map((n) => n.trim())
                .filter(Boolean)
                .map((admin) =>
                  waClient.sendMessage(
                    admin.endsWith("@c.us") ? admin : admin.replace(/\D/g, "") + "@c.us",
                    rekapMsg
                  ).catch(() => {})
                )
            );
          }
        } catch (waErr) {
          sendDebug({
            tag: "CRON IG",
            msg: `[client=${client.client_id}] ERROR rekap likes: ${waErr.message}`,
          });
        }

        // --- Absensi Likes IG ---
        try {
          const msg = await absensiLikesAkumulasiBelum(client.client_id);
          if (msg && msg.length > 0) {
            sendDebug({
              tag: "CRON IG",
              msg: `[client=${client.client_id}] Absensi likes IG akan dikirim ke admin.`,
            });
            // KIRIM KE ADMIN, BUKAN KE CLIENT
            await Promise.all(
              process.env.ADMIN_WHATSAPP.split(",")
                .map((n) => n.trim())
                .filter(Boolean)
                .map((admin) =>
                  waClient.sendMessage(
                    admin.endsWith("@c.us") ? admin : admin.replace(/\D/g, "") + "@c.us",
                    msg
                  ).catch(() => {})
                )
            );
          }
        } catch (waErr) {
          sendDebug({
            tag: "CRON IG",
            msg: `[client=${client.client_id}] ERROR absensi IG: ${waErr.message}`,
          });
        }
      }

      sendDebug({
        tag: "CRON IG",
        msg: "Laporan absensi likes berhasil dikirim ke admin.",
      });
    } catch (err) {
      sendDebug({
        tag: "CRON IG",
        msg: `[ERROR GLOBAL] ${err.message || err}`,
      });
    }
  },
  {
    timezone: "Asia/Jakarta",
  }
);

// ===== END FILE =====
