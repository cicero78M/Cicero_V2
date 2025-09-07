import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import {
  absensiLikesDitbinmas,
  formatRekapBelumLengkapDitbinmas,
} from "../handler/menu/dirRequestHandlers.js";
import { safeSendMessage, getAdminWAIds } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";

const DIRREQUEST_GROUP = "120363419830216549@g.us";
const EXTRA_WA = "081234560377";

function toWAid(id) {
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith("@c.us") || trimmed.endsWith("@g.us")) return trimmed;
  return trimmed.replace(/\D/g, "") + "@c.us";
}

function getRecipients() {
  const extra = toWAid(EXTRA_WA);
  return new Set([...getAdminWAIds(), DIRREQUEST_GROUP, extra].filter(Boolean));
}

export async function runCron() {
  sendDebug({ tag: "CRON DIRREQ DIREKTORAT", msg: "Mulai cron dirrequest direktorat" });
  try {
    const likesMsg = await absensiLikesDitbinmas();
    const rekapMsg = await formatRekapBelumLengkapDitbinmas();
    const recipients = getRecipients();
    for (const wa of recipients) {
      await safeSendMessage(waClient, wa, likesMsg.trim());
      await safeSendMessage(waClient, wa, rekapMsg.trim());
    }
    sendDebug({
      tag: "CRON DIRREQ DIREKTORAT",
      msg: `Laporan dikirim ke ${recipients.size} penerima`,
    });
  } catch (err) {
    sendDebug({
      tag: "CRON DIRREQ DIREKTORAT",
      msg: `[ERROR] ${err.message || err}`,
    });
  }
}

cron.schedule("0 21 * * *", runCron, { timezone: "Asia/Jakarta" });

export default null;
