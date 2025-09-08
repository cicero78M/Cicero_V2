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

const REKAP_RECIPIENT = "6281234560377@c.us";

function getRecipients() {
  return new Set([...getAdminWAIds(), REKAP_RECIPIENT]);
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

cron.schedule("45 20 * * *", runCron, { timezone: "Asia/Jakarta" });

export default null;
