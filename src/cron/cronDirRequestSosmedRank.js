import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import { waGatewayClient } from "../service/waService.js";
import { absensiLikes } from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import { absensiKomentar } from "../handler/fetchabsensi/tiktok/absensiKomentarTiktok.js";
import { safeSendMessage, getAdminWAIds } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";

const DIRREQUEST_GROUP = "120363419830216549@g.us";
const RANK_RECIPIENT = "6281234560377@c.us";

function getRecipients(includeRankRecipient = false) {
  const recipients = new Set([...getAdminWAIds(), DIRREQUEST_GROUP]);
  if (includeRankRecipient) recipients.add(RANK_RECIPIENT);
  return recipients;
}

export async function runCron(includeRankRecipient = false) {
  sendDebug({ tag: "CRON DIRREQ SOSMED RANK", msg: "Mulai cron dirrequest sosmed rank" });
  try {
    const likesMsg = await absensiLikes("DITBINMAS", { mode: "all", roleFlag: "ditbinmas" });
    const komentarMsg = await absensiKomentar("DITBINMAS", { roleFlag: "ditbinmas" });
    const recipients = getRecipients(includeRankRecipient);
    for (const wa of recipients) {
      await safeSendMessage(waGatewayClient, wa, likesMsg.trim());
      await safeSendMessage(waGatewayClient, wa, komentarMsg.trim());
    }
    sendDebug({
      tag: "CRON DIRREQ SOSMED RANK",
      msg: `Laporan dikirim ke ${recipients.size} penerima`,
    });
  } catch (err) {
    sendDebug({
      tag: "CRON DIRREQ SOSMED RANK",
      msg: `[ERROR] ${err.message || err}`,
    });
  }
}

cron.schedule("7 15 * * *", () => runCron(false), { timezone: "Asia/Jakarta" });
cron.schedule("7 18 * * *", () => runCron(false), { timezone: "Asia/Jakarta" });
cron.schedule("32 20 * * *", () => runCron(false), { timezone: "Asia/Jakarta" });

export default null;
