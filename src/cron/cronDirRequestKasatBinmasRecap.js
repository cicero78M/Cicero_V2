import dotenv from "dotenv";
dotenv.config();

import { waGatewayClient } from "../service/waService.js";
import { generateKasatBinmasLikesRecap } from "../service/kasatBinmasLikesRecapService.js";
import { generateKasatBinmasTiktokCommentRecap } from "../service/kasatBinmasTiktokCommentRecapService.js";
import { safeSendMessage, getAdminWAIds } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";

//const DIRREQUEST_GROUP = "120363419830216549@g.us";
const PRIMARY_RECIPIENT = "6281234560377@c.us";
const CRON_TAG = "CRON DIRREQ KASAT BINMAS";
export const JOB_KEY = "./src/cron/cronDirRequestKasatBinmasRecap.js";

function getRecipients() {
  return new Set([...getAdminWAIds(), PRIMARY_RECIPIENT]);
}

function getJakartaDate(baseDate = new Date()) {
  return new Date(
    new Date(baseDate).toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );
}

function isLastDayOfJakartaMonth(date = new Date()) {
  const jakartaDate = getJakartaDate(date);
  const nextDay = new Date(jakartaDate);
  nextDay.setDate(jakartaDate.getDate() + 1);
  return nextDay.getMonth() !== jakartaDate.getMonth();
}

async function sendKasatBinmasRecap(period) {
  const recipients = getRecipients();

  sendDebug({
    tag: CRON_TAG,
    msg: `Mulai cron rekap Kasat Binmas periode ${period} untuk ${recipients.size} penerima`,
  });

  try {
    const likesRecap = await generateKasatBinmasLikesRecap({ period });
    const commentRecap = await generateKasatBinmasTiktokCommentRecap({ period });

    for (const wa of recipients) {
      await safeSendMessage(waGatewayClient, wa, likesRecap.trim());
      await safeSendMessage(waGatewayClient, wa, commentRecap.trim());
    }

    sendDebug({
      tag: CRON_TAG,
      msg: `Rekap Kasat Binmas periode ${period} dikirim ke ${recipients.size} penerima`,
    });
  } catch (err) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[ERROR] ${err?.message || err}`,
    });
  }
}

export async function runDailyRecap() {
  await sendKasatBinmasRecap("daily");
}

export async function runWeeklyRecap() {
  await sendKasatBinmasRecap("weekly");
}

export async function runMonthlyRecap(referenceDate = new Date()) {
  if (!isLastDayOfJakartaMonth(referenceDate)) {
    sendDebug({
      tag: CRON_TAG,
      msg: "Lewati cron rekap Kasat Binmas bulanan karena bukan akhir bulan",
    });
    return;
  }
  await sendKasatBinmasRecap("monthly");
}

