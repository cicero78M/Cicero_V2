import { scheduleCronJob } from "../utils/cronScheduler.js";
import dotenv from "dotenv";
dotenv.config();

import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";
import waClient from "../service/waService.js";

import { getActiveClientsIG, absensiLikes } from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import { rekapLikesIG } from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import { sendDebug } from "../middleware/debugHandler.js";

const JOB_KEY = "./src/cron/cronInstaService.js";

scheduleCronJob(
  JOB_KEY,
  "30 6-21 * * *",
  async () => {
    sendDebug({
      tag: "CRON IG",
      msg: "Mulai tugas fetchInsta, fetchLikes & absensiLikes akumulasi belum...",
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
      const fetchSummary = {};
      for (const client of clients) {
        try {
          const res = await fetchAndStoreInstaContent(
            keys,
            null,
            null,
            client.client_id
          );
          const stat = res?.[client.client_id] || {};
          fetchSummary[client.client_id] = { count: stat.count || 0 };
        } catch (err) {
          fetchSummary[client.client_id] = {
            count: 0,
            error: err.message,
          };
        }
      }

      let debugMsg = `[CRON IG] Ringkasan fetch Instagram\n`;
      debugMsg += `Tanggal: ${new Date().toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      })}\n`;
      if (Object.keys(fetchSummary).length) {
        Object.entries(fetchSummary).forEach(([client, stat]) => {
          debugMsg += `Client: ${client}\n  - Jumlah post hari ini: ${stat.count || 0}\n`;
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
        if (!client.client_insta_status) continue;
        // --- FETCH LIKES IG ---
        try {
          sendDebug({
            tag: "CRON IG",
            msg: `[client=${client.client_id}] Memulai fetch likes IG...`
          });
          await handleFetchLikesInstagram(null, null, client.client_id); // Cron, tanpa WA, client_id saja
          sendDebug({
            tag: "CRON IG",
            msg: `[client=${client.client_id}] Selesai fetch likes IG.`
          });
        } catch (waErr) {
          sendDebug({
            tag: "CRON IG",
            msg: `[client=${client.client_id}] ERROR fetch likes IG: ${waErr.message}`,
          });
        }

        // --- OPTIONAL: REKAP LIKES IG (jika masih ingin dikirim ke admin) ---
        try {
          const rekapMsg = await rekapLikesIG(client.client_id);
          if (rekapMsg) {
            sendDebug({
              tag: "CRON IG",
              msg: `[client=${client.client_id}] Rekap likes IG akan dikirim ke admin.`,
            });
            // Kirim ke admin WA (boleh dihapus kalau tidak perlu)
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

        // --- ABSENSI LIKES IG (HANYA "BELUM") ---
        try {
          // Hanya mode: "belum"
          const msg = await absensiLikes(client.client_id, { mode: "belum" });
          if (msg && msg.length > 0 && !/Belum melaksanakan: \*0\*/.test(msg)) {
            sendDebug({
              tag: "CRON IG",
              msg: `[client=${client.client_id}] Absensi likes IG (BELUM) akan dikirim ke admin.`,
            });
            // Kirim ke semua admin WhatsApp
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
          } else {
            sendDebug({
              tag: "CRON IG",
              msg: `[client=${client.client_id}] Semua user sudah like, tidak ada laporan belum dikirim.`,
            });
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
        msg: "Laporan absensi likes (belum) selesai dikirim ke admin.",
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
