import dotenv from "dotenv";
dotenv.config();

import { waGatewayClient } from "../service/waService.js";
import { absensiLikes } from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import { absensiKomentar } from "../handler/fetchabsensi/tiktok/absensiKomentarTiktok.js";
import { safeSendMessage } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { buildClientRecipientSet } from "../utils/recipientHelper.js";

const CLIENT_ID = "DITBINMAS";

export const JOB_KEY = "./src/cron/cronDirRequestSosmedRank.js";

export async function runCron() {
  sendDebug({ tag: "CRON DIRREQ SOSMED RANK", msg: "Mulai cron dirrequest sosmed rank" });
  try {
    const { recipients, hasClientRecipients } = await buildClientRecipientSet(CLIENT_ID, {
      includeGroup: true,
    });
    if (!recipients.size) {
      sendDebug({ tag: "CRON DIRREQ SOSMED RANK", msg: "Tidak ada penerima WA yang valid" });
      return;
    }

    const likesMsg = await absensiLikes(CLIENT_ID, { mode: "all", roleFlag: "ditbinmas" });
    const komentarMsg = await absensiKomentar(CLIENT_ID, { roleFlag: "ditbinmas" });
    for (const wa of recipients) {
      await safeSendMessage(waGatewayClient, wa, likesMsg.trim());
      await safeSendMessage(waGatewayClient, wa, komentarMsg.trim());
    }
    sendDebug({
      tag: "CRON DIRREQ SOSMED RANK",
      msg: `Laporan dikirim ke ${recipients.size} penerima${
        hasClientRecipients ? "" : " (fallback admin)"
      }`,
    });
  } catch (err) {
    sendDebug({
      tag: "CRON DIRREQ SOSMED RANK",
      msg: `[ERROR] ${err.message || err}`,
    });
  }
}

