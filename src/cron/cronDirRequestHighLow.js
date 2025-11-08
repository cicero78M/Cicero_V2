import { scheduleCronJob } from "../utils/cronScheduler.js";
import dotenv from "dotenv";
dotenv.config();

import { waGatewayClient } from "../service/waService.js";
import { generateWeeklyInstagramHighLowReport } from "../service/weeklyInstagramHighLowService.js";
import { generateWeeklyTiktokHighLowReport } from "../service/weeklyTiktokHighLowService.js";
import { safeSendMessage } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";

const RECIPIENT = "6281234560377@c.us";
const CRON_TAG = "CRON DIRREQ HIGHLOW";

export async function runCron() {
  sendDebug({ tag: CRON_TAG, msg: "Mulai cron dirrequest high low" });
  try {
    const instagramReport = await generateWeeklyInstagramHighLowReport("DITBINMAS", { roleFlag: "ditbinmas" });
    await safeSendMessage(waGatewayClient, RECIPIENT, instagramReport.trim());

    const tiktokReport = await generateWeeklyTiktokHighLowReport("DITBINMAS", { roleFlag: "ditbinmas" });
    await safeSendMessage(waGatewayClient, RECIPIENT, tiktokReport.trim());

    sendDebug({
      tag: CRON_TAG,
      msg: `Laporan Instagram dan TikTok dikirim ke ${RECIPIENT}`,
    });
  } catch (err) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[ERROR] ${err?.message || err}`,
    });
  }
}

const JOB_KEY = "./src/cron/cronDirRequestHighLow.js";

if (process.env.JEST_WORKER_ID === undefined) {
  scheduleCronJob(JOB_KEY, "50 20 * * 0", () => runCron(), { timezone: "Asia/Jakarta" });
}

export default null;
