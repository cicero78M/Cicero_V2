import dotenv from "dotenv";
dotenv.config();

import { waGatewayClient } from "../service/waService.js";
import { generateWeeklyInstagramHighLowReport } from "../service/weeklyInstagramHighLowService.js";
import { generateWeeklyTiktokHighLowReport } from "../service/weeklyTiktokHighLowService.js";
import { safeSendMessage } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { buildClientRecipientSet } from "../utils/recipientHelper.js";

const CLIENT_ID = "DITBINMAS";
const CRON_TAG = "CRON DIRREQ HIGHLOW";

export async function runCron(clientId = CLIENT_ID) {
  sendDebug({ tag: CRON_TAG, msg: "Mulai cron dirrequest high low" });
  try {
    const { recipients, hasClientRecipients } = await buildClientRecipientSet(clientId);
    if (!recipients.size) {
      sendDebug({ tag: CRON_TAG, msg: "Tidak ada penerima WA yang valid untuk laporan high-low" });
      return;
    }

    const instagramReport = await generateWeeklyInstagramHighLowReport(clientId, { roleFlag: "ditbinmas" });
    const tiktokReport = await generateWeeklyTiktokHighLowReport(clientId, { roleFlag: "ditbinmas" });

    for (const wa of recipients) {
      await safeSendMessage(waGatewayClient, wa, instagramReport.trim());
      await safeSendMessage(waGatewayClient, wa, tiktokReport.trim());
    }

    sendDebug({
      tag: CRON_TAG,
      msg: `Laporan Instagram dan TikTok dikirim ke ${recipients.size} penerima${
        hasClientRecipients ? "" : " (fallback admin)"
      }`,
    });
  } catch (err) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[ERROR] ${err?.message || err}`,
    });
  }
}

export const JOB_KEY = "./src/cron/cronDirRequestHighLow.js";

