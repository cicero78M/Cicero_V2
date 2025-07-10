import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";

import { absensiLink } from "../handler/fetchabsensi/link/absensiLinkAmplifikasi.js";

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
        try {
          const msg = await absensiLink(client.client_id);
          const targets = getRecipients(client);
          for (const wa of targets) {
            await waClient.sendMessage(wa, msg).catch(() => {});
          }
          sendDebug({
            tag: "CRON LINK",
            msg: `[${client.client_id}] Rekap absensi link dikirim ke ${targets.length} penerima`,
          });
        } catch (err) {
          sendDebug({
            tag: "CRON LINK",
            msg: `[${client.client_id}] ERROR absensi link: ${err.message}`,
          });
        }
      }
    } catch (err) {
      sendDebug({ tag: "CRON LINK", msg: `[ERROR GLOBAL] ${err.message || err}` });
    }
  },
  { timezone: "Asia/Jakarta" }
);

export default null;
