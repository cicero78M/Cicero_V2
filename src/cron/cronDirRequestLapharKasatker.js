import dotenv from "dotenv";
dotenv.config();

import { waGatewayClient } from "../service/waService.js";
import { generateKasatkerReport } from "../service/kasatkerReportService.js";
import { safeSendMessage } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { buildClientRecipientSet } from "../utils/recipientHelper.js";

const TAG = "CRON DIRREQ KASATKER";
const DEFAULT_CLIENT_ID = "DITBINMAS";
const DEFAULT_ROLE_FLAG = "ditbinmas";

function getJakartaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const formatted = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type === "year" || part.type === "month" || part.type === "day") {
      acc[part.type] = Number(part.value);
    }
    return acc;
  }, {});
  return {
    year: formatted.year,
    month: formatted.month,
    day: formatted.day,
  };
}

function isLastDayOfMonthJakarta(date = new Date()) {
  const { year, month, day } = getJakartaDateParts(date);
  if (!year || !month || !day) {
    return false;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day === lastDay;
}

async function sendKasatkerReport(period, description) {
  sendDebug({ tag: TAG, msg: `Mulai laporan ${description}` });
  try {
    const { recipients, hasClientRecipients } = await buildClientRecipientSet(
      DEFAULT_CLIENT_ID,
      {
        includeAdmins: false,
        includeGroup: false,
        includeSuper: false,
      }
    );
    if (!recipients.size) {
      sendDebug({ tag: TAG, msg: "Tidak ada penerima WA yang valid untuk laporan Kasatker" });
      return false;
    }

    const narrative = await generateKasatkerReport({
      clientId: DEFAULT_CLIENT_ID,
      roleFlag: DEFAULT_ROLE_FLAG,
      period,
    });

    const targets = Array.from(recipients);
    const results = await Promise.all(
      targets.map((target) =>
        safeSendMessage(waGatewayClient, target, String(narrative || "").trim())
      )
    );

    const success = results.some(Boolean);

    if (success) {
      sendDebug({
        tag: TAG,
        msg: `Laporan ${description} dikirim ke ${targets.length} penerima${
          hasClientRecipients ? "" : " (fallback admin)"
        }`,
      });
    } else {
      sendDebug({
        tag: TAG,
        msg: `Laporan ${description} gagal dikirim ke ${targets.length} penerima`,
      });
    }

    return success;
  } catch (error) {
    sendDebug({
      tag: TAG,
      msg: `[ERROR ${description}] ${error?.message || error}`,
    });
    return false;
  }
}

export async function runDailyReport() {
  return sendKasatkerReport("today", "harian");
}

export async function runWeeklyReport() {
  return sendKasatkerReport("this_week", "mingguan");
}

export async function runMonthlyReport(date = new Date()) {
  if (!isLastDayOfMonthJakarta(date)) {
    sendDebug({
      tag: TAG,
      msg: "Lewati laporan bulanan karena belum akhir bulan",
    });
    return false;
  }
  return sendKasatkerReport("this_month", "bulanan");
}

export const JOB_KEY = "./src/cron/cronDirRequestLapharKasatker.js";

export { isLastDayOfMonthJakarta };

