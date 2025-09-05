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

const groupId = "120363419830216549@g.us";
const cronTag = "CRON DIRREQUEST";
const options = { timezone: "Asia/Jakarta" };

async function runRekap(chatIds) {
  sendDebug({ tag: cronTag, msg: "Mulai rekap dirrequest" });
  try {
    const clients = await getActiveClients();
    for (const client of clients) {
      try {
        const msg1 = await formatRekapUserData(client.client_id);
        for (const wa of chatIds) {
          await waClient.sendMessage(wa, msg1).catch(() => {});
        }
        sendDebug({
          tag: cronTag,
          msg: `[${client.client_id}] Rekap menu 1 dikirim ke ${chatIds.length} target`,
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
}

cron.schedule("0 15,18 * * *", () => runRekap([groupId]), options);
cron.schedule("30 20 * * *", () => runRekap([groupId]), options);

export default null;
