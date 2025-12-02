import dotenv from "dotenv";
dotenv.config();

import { waGatewayClient } from "../service/waService.js";
import {
  absensiLikesDitbinmasSimple,
  absensiKomentarDitbinmasSimple,
} from "../handler/menu/dirRequestHandlers.js";
import { safeSendMessage } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { buildClientRecipientSet } from "../utils/recipientHelper.js";

const CLIENT_ID = "DITBINMAS";

export async function runCron(clientId = CLIENT_ID) {
  sendDebug({ tag: "CRON DIRREQ DIREKTORAT", msg: "Mulai cron dirrequest direktorat" });
  try {
    const { recipients, hasClientRecipients } = await buildClientRecipientSet(clientId, {
      includeAdmins: false,
      includeOperator: false,
      includeGroup: false,
    });
    if (!recipients.size) {
      sendDebug({
        tag: "CRON DIRREQ DIREKTORAT",
        msg: "Tidak ada penerima WA yang valid untuk rekap absensi direktorat",
      });
      return;
    }

    const likesMsg = await absensiLikesDitbinmasSimple(clientId);
    const komentarMsg = await absensiKomentarDitbinmasSimple(clientId);
    for (const wa of recipients) {
      await safeSendMessage(waGatewayClient, wa, likesMsg.trim());
      await safeSendMessage(waGatewayClient, wa, komentarMsg.trim());
    }
    sendDebug({
      tag: "CRON DIRREQ DIREKTORAT",
      msg: `Laporan dikirim ke ${recipients.size} penerima${
        hasClientRecipients ? "" : " (fallback admin)"
      }`,
    });
  } catch (err) {
    sendDebug({
      tag: "CRON DIRREQ DIREKTORAT",
      msg: `[ERROR] ${err.message || err}`,
    });
  }
}

export const JOB_KEY = "./src/cron/cronDirRequestDirektorat.js";

