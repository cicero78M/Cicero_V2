import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { formatRekapUserData, formatExecutiveSummary } from "../handler/menu/dirRequestHandlers.js";
import { safeSendMessage } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";

const DIRREQUEST_GROUP = "120363419830216549@g.us";

function toWAid(id) {
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith("@c.us") || trimmed.endsWith("@g.us")) return trimmed;
  return trimmed.replace(/\D/g, "") + "@c.us";
}

function getAdminWAIds() {
  return (process.env.ADMIN_WHATSAPP || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map(toWAid)
    .filter(Boolean);
}

export async function runCron() {
  sendDebug({ tag: "CRON DIRREQ REKAP", msg: "Mulai cron dirrequest rekap update" });
  try {
    const executive = await formatExecutiveSummary("DITBINMAS", "ditbinmas");
    const rekap = await formatRekapUserData("DITBINMAS", "ditbinmas");

    const recipients = new Set([...getAdminWAIds(), DIRREQUEST_GROUP]);
    for (const wa of recipients) {
      await safeSendMessage(waClient, wa, executive.trim());
      await safeSendMessage(waClient, wa, rekap.trim());
    }

    sendDebug({
      tag: "CRON DIRREQ REKAP",
      msg: `Laporan dikirim ke ${recipients.size} penerima`,
    });
  } catch (err) {
    sendDebug({
      tag: "CRON DIRREQ REKAP",
      msg: `[ERROR] ${err.message || err}`,
    });
  }
}

cron.schedule("0 8-18/3 * * *", runCron, { timezone: "Asia/Jakarta" });

export default null;

