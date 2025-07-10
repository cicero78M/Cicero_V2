import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";

import { getReportsTodayByClient } from "../model/linkReportModel.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { hariIndo } from "../utils/constants.js";
import { getGreeting } from "../utils/utilsHelper.js";

async function getActiveClients() {
  const { query } = await import("../db/index.js");
  const rows = await query(
    `SELECT client_id, nama, client_operator, client_super, client_group
     FROM clients
     WHERE client_status=true AND client_insta_status=true
     ORDER BY client_id`
  );
  return rows.rows;
}

function toWAid(number) {
  if (!number || typeof number !== "string") return null;
  const no = number.trim();
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

function getRecipients(client) {
  const result = new Set();
  getAdminWAIds().forEach(n => result.add(n));
  [client.client_operator, client.client_super, client.client_group]
    .map(toWAid)
    .filter(Boolean)
    .forEach(n => result.add(n));
  return Array.from(result);
}

cron.schedule(
  "2 15,20 * * *",
  async () => {
    sendDebug({ tag: "CRON LINK", msg: "Mulai rekap link harian" });
    try {
      const clients = await getActiveClients();
      for (const client of clients) {
        const reports = await getReportsTodayByClient(client.client_id);
        if (!reports || reports.length === 0) {
          sendDebug({
            tag: "CRON LINK",
            msg: `[${client.client_id}] Tidak ada laporan link hari ini.`,
          });
          continue;
        }

        const shortcodes = await getShortcodesTodayByClient(client.client_id);
        const list = {
          facebook: [],
          instagram: [],
          twitter: [],
          tiktok: [],
          youtube: [],
        };
        const users = new Set();
        reports.forEach(r => {
          users.add(r.user_id);
          if (r.facebook_link) list.facebook.push(r.facebook_link);
          if (r.instagram_link) list.instagram.push(r.instagram_link);
          if (r.twitter_link) list.twitter.push(r.twitter_link);
          if (r.tiktok_link) list.tiktok.push(r.tiktok_link);
          if (r.youtube_link) list.youtube.push(r.youtube_link);
        });
        const totalLinks =
          list.facebook.length +
          list.instagram.length +
          list.twitter.length +
          list.tiktok.length +
          list.youtube.length;

        const now = new Date();
        const hari = hariIndo[now.getDay()];
        const tanggal = now.toLocaleDateString("id-ID");
        const jam = now.toLocaleTimeString("id-ID", { hour12: false });
        const salam = getGreeting();

        const kontenLinks = shortcodes.map(
          sc => `https://www.instagram.com/p/${sc}`
        );

        let msg = `${salam}\n\n`;
        const clientName = client.nama || client.client_id;
        msg += `Mohon Ijin Melaporkan Pelaksanaan Tugas Amplifikasi *${clientName}* pada hari :\n`;
        msg += `Hari : ${hari}\n`;
        msg += `Tanggal : ${tanggal}\n`;
        msg += `Pukul : ${jam}\n\n`;

        msg += `Jumlah Konten Resmi Hari ini : ${shortcodes.length}\n`;
        if (kontenLinks.length > 0) {
          msg += `${kontenLinks.join("\n")}\n\n`;
        } else {
          msg += "-\n\n";
        }

        msg += `Jumlah Personil yang melaksnakan : ${users.size}\n`;
        msg += `Jumlah Total Link dari 5 Platform Sosial Media : ${totalLinks}\n\n`;

        msg += `Link Sebagai Berikut :\n`;
        msg += `Facebook (${list.facebook.length}):\n${list.facebook.join("\n") || "-"}`;
        msg += `\n\nInstagram (${list.instagram.length}):\n${list.instagram.join("\n") || "-"}`;
        msg += `\n\nTwitter (${list.twitter.length}):\n${list.twitter.join("\n") || "-"}`;
        msg += `\n\nTikTok (${list.tiktok.length}):\n${list.tiktok.join("\n") || "-"}`;
        msg += `\n\nYoutube (${list.youtube.length}):\n${list.youtube.join("\n") || "-"}`;

        const targets = getRecipients(client);
        for (const wa of targets) {
          await waClient.sendMessage(wa, msg.trim()).catch(() => {});
        }
        sendDebug({
          tag: "CRON LINK",
          msg: `[${client.client_id}] Rekap link dikirim ke ${targets.length} penerima`,
        });
      }
    } catch (err) {
      sendDebug({ tag: "CRON LINK", msg: `[ERROR GLOBAL] ${err.message || err}` });
    }
  },
  { timezone: "Asia/Jakarta" }
);

export default null;
