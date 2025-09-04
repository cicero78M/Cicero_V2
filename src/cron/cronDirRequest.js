import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { formatRekapUserData } from "../handler/menu/dirRequestHandlers.js";

async function getActiveClients() {
  const { query } = await import("../db/index.js");
  const rows = await query(
    `SELECT client_id
     FROM clients
     WHERE client_status=true
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
    .map((n) => n.trim())
    .filter(Boolean)
    .map(toWAid)
    .filter(Boolean);
}

const cronTag = "CRON DIRREQUEST";

cron.schedule(
  "3 7-20 * * *",
  async () => {
    sendDebug({ tag: cronTag, msg: "Mulai rekap dirrequest" });
    try {
      const admins = getAdminWAIds();
      const clients = await getActiveClients();
      for (const client of clients) {
        try {
          const msg1 = await formatRekapUserData(client.client_id);
          for (const wa of admins) {
            await waClient.sendMessage(wa, msg1).catch(() => {});
          }
          sendDebug({
            tag: cronTag,
            msg: `[${client.client_id}] Rekap menu 1 dikirim ke ${admins.length} admin`,
          });
        } catch (err) {
          sendDebug({
            tag: cronTag,
            msg: `[${client.client_id}] ERROR menu 1: ${err.message}`,
          });
        }
      }
    } catch (err) {
      sendDebug({ tag: cronTag, msg: `[ERROR GLOBAL] ${err.message || err}` });
    }
  },
  { timezone: "Asia/Jakarta" }
);

export default null;
