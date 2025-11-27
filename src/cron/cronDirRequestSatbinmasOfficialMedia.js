import { scheduleCronJob } from "../utils/cronScheduler.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { waGatewayClient } from "../service/waService.js";
import { formatToWhatsAppId, getAdminWAIds, safeSendMessage } from "../utils/waHelper.js";
import {
  buildSatbinmasOfficialInstagramRecap,
  buildSatbinmasOfficialTiktokRecap,
} from "../service/satbinmasOfficialReportService.js";

const ADDITIONAL_RECIPIENT = formatToWhatsAppId("081130744171");
const JOB_KEY = "./src/cron/cronDirRequestSatbinmasOfficialMedia.js";
const CRON_TAG = "CRON DIRREQ SATBINMAS OFFICIAL MEDIA";

function getRecipients() {
  return new Set([...getAdminWAIds(), ADDITIONAL_RECIPIENT]);
}

async function sendRecapToRecipients(message, recipients) {
  for (const wid of recipients) {
    await safeSendMessage(waGatewayClient, wid, message);
  }
}

export async function runCron() {
  const recipients = getRecipients();
  sendDebug({ tag: CRON_TAG, msg: "Mulai cron dirrequest Satbinmas Official (IG & TikTok)" });

  try {
    const instagramRecap = await buildSatbinmasOfficialInstagramRecap();
    await sendRecapToRecipients(instagramRecap, recipients);
    sendDebug({
      tag: CRON_TAG,
      msg: `Rekap Instagram dikirim ke ${recipients.size} penerima`,
    });
  } catch (error) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[ERROR IG] ${error?.message || error}`,
    });
  }

  try {
    const tiktokRecap = await buildSatbinmasOfficialTiktokRecap();
    await sendRecapToRecipients(tiktokRecap, recipients);
    sendDebug({
      tag: CRON_TAG,
      msg: `Rekap TikTok dikirim ke ${recipients.size} penerima`,
    });
  } catch (error) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[ERROR TIKTOK] ${error?.message || error}`,
    });
  }
}

if (process.env.JEST_WORKER_ID === undefined) {
  scheduleCronJob(JOB_KEY, "5 13,22 * * *", () => runCron(), { timezone: "Asia/Jakarta" });
}

export default null;
