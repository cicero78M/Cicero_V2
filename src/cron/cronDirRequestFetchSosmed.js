import { scheduleCronJob } from "../utils/cronScheduler.js";
import dotenv from "dotenv";
dotenv.config();

import { waGatewayClient } from "../service/waService.js";
import { getInstaPostCount, getTiktokPostCount } from "../service/postCountService.js";
import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";
import { fetchAndStoreTiktokContent } from "../handler/fetchpost/tiktokFetchPost.js";
import { handleFetchKomentarTiktokBatch } from "../handler/fetchengagement/fetchCommentTiktok.js";
import { generateSosmedTaskMessage } from "../handler/fetchabsensi/sosmedTask.js";
import { safeSendMessage, getAdminWAIds } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { getVideoIdsTodayByClient } from "../model/tiktokPostModel.js";

const DIRREQUEST_GROUP = "120363419830216549@g.us";

let lastIgCount = null;
let lastTiktokCount = null;
let lastIgShortcodes = [];
let lastTiktokVideoIds = [];

async function initializeLastCounts() {
  lastIgCount = await getInstaPostCount("DITBINMAS");
  lastTiktokCount = await getTiktokPostCount("DITBINMAS");
}

if (process.env.JEST_WORKER_ID === undefined) {
  await initializeLastCounts();
}

function getRecipients() {
  return new Set([...getAdminWAIds(), DIRREQUEST_GROUP]);
}

export async function runCron() {
  sendDebug({ tag: "CRON DIRFETCH SOSMED", msg: "Mulai cron dirrequest fetch sosmed" });
  try {
    const previousIgShortcodes = await getShortcodesTodayByClient("DITBINMAS");
    const previousTiktokVideoIds = await getVideoIdsTodayByClient("DITBINMAS");
    await fetchAndStoreInstaContent(
      ["shortcode", "caption", "like_count", "timestamp"],
      null,
      null,
      "DITBINMAS"
    );
    await handleFetchLikesInstagram(null, null, "DITBINMAS");
    await fetchAndStoreTiktokContent("DITBINMAS");
    await handleFetchKomentarTiktokBatch(null, null, "DITBINMAS");
    const { text, igCount, tiktokCount, state } = await generateSosmedTaskMessage("DITBINMAS", {
      skipTiktokFetch: true,
      skipLikesFetch: true,
      previousState: {
        igShortcodes: previousIgShortcodes,
        tiktokVideoIds: previousTiktokVideoIds,
      },
    });
    if (igCount !== lastIgCount || tiktokCount !== lastTiktokCount) {
      const recipients = getRecipients();
      for (const wa of recipients) {
        await safeSendMessage(waGatewayClient, wa, text.trim());
      }
      sendDebug({
        tag: "CRON DIRFETCH SOSMED",
        msg: `Laporan dikirim ke ${recipients.size} penerima`,
      });
      lastIgCount = igCount;
      lastTiktokCount = tiktokCount;
      lastIgShortcodes = state?.igShortcodes ?? previousIgShortcodes ?? lastIgShortcodes;
      lastTiktokVideoIds = state?.tiktokVideoIds ?? previousTiktokVideoIds ?? lastTiktokVideoIds;
    }
  } catch (err) {
    sendDebug({
      tag: "CRON DIRFETCH SOSMED",
      msg: `[ERROR] ${err.message || err}`,
    });
  }
}

const JOB_KEY = "./src/cron/cronDirRequestFetchSosmed.js";

scheduleCronJob(JOB_KEY, "30 6 * * *", runCron, { timezone: "Asia/Jakarta" });
scheduleCronJob(JOB_KEY, "0,30 7-20 * * *", runCron, { timezone: "Asia/Jakarta" });

export default null;
