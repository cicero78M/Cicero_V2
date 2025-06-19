import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { fetchAndStoreTiktokContent } from "../handler/fetchpost/tiktokFetchPost.js";
import { handleFetchKomentarTiktokBatch } from "../handler/fetchengagement/fetchCommentTiktok.js";
import { absensiKomentar } from "../handler/fetchabsensi/tiktok/absensiKomentarTiktok.js";

// Helper ambil client TikTok aktif + notif WA
async function getActiveClientsTiktok() {
  const { query } = await import("../db/index.js");
  const rows = await query(
    `SELECT client_id, nama, client_operator, client_super, client_group
     FROM clients
     WHERE client_status = true AND client_tiktok_status = true
     ORDER BY client_id`
  );
  return rows.rows;
}

// Format nomor WhatsApp ke @c.us
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
  // Gabung admin, operator, super admin, group (unik & valid)
  const result = new Set();
  getAdminWAIds().forEach(n => result.add(n));
  [client.client_operator, client.client_super, client.client_group]
    .map(toWAid)
    .filter(Boolean)
    .forEach(n => result.add(n));
  return Array.from(result);
}

// Jadwalkan cron tiap jam 06:25 - 20:25 WIB
cron.schedule(
  "03 15,18,21,23 * * *",
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
      // Kirim ringkasan fetch TikTok (debug WA admin)
      let summaryMsg = `[CRON TTK] Ringkasan fetch TikTok\nTanggal: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}\n`;
      Object.entries(fetchSummary).forEach(([cid, status]) => {
        summaryMsg += `- ${cid} : ${status}\n`;
      });
      for (const admin of getAdminWAIds()) {
        await waClient.sendMessage(admin, summaryMsg).catch(() => {});
      }

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

      // Step 3: Absensi Komentar TikTok ("belum" saja, ke admin, operator, super, group)
      for (const client of clients) {
        try {
          // Hanya mode: "belum"
          const msg = await absensiKomentar(client.client_id, { mode: "belum" });
          if (msg && msg.length > 0 && !/Belum melaksanakan: \*0\*/.test(msg)) {
            sendDebug({
              tag: "CRON TTK",
              msg: `[client=${client.client_id}] Absensi komentar TTK (BELUM) akan dikirim ke semua penerima.`,
            });
            // Kirim ke admin, operator, super, group
            for (const wa of getAllNotifRecipients(client)) {
              await waClient.sendMessage(wa, msg).catch(() => {});
            }
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
        msg: "Laporan absensi komentar (belum) selesai dikirim.",
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
