import dotenv from "dotenv";
dotenv.config();

import { waGatewayClient } from "../service/waService.js";
import { collectLikesRecap } from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import { collectKomentarRecap } from "../handler/fetchabsensi/tiktok/absensiKomentarTiktok.js";
import { saveLikesRecapPerContentExcel } from "../service/likesRecapExcelService.js";
import { saveCommentRecapExcel } from "../service/commentRecapExcelService.js";
import { sendWAFile, safeSendMessage } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { readFile, unlink } from "fs/promises";
import { basename } from "path";
import { buildClientRecipientSet } from "../utils/recipientHelper.js";

const CLIENT_ID = "DITBINMAS";

export async function runCron() {
  sendDebug({
    tag: "CRON DIRREQ ALL SOCMED",
    msg: "Mulai cron dirrequest rekap all socmed",
  });
  const { recipients, hasClientRecipients } = await buildClientRecipientSet(CLIENT_ID, {
    includeGroup: true,
    includeAdmins: false,
    includeSuper: false,
    includeOperator: false,
  });
  if (!recipients.size) {
    sendDebug({
      tag: "CRON DIRREQ ALL SOCMED",
      msg: "Tidak ada penerima WA yang valid untuk rekap all socmed",
    });
    return;
  }
  let igRecapPath = null;
  let ttRecapPath = null;
  try {
    try {
      const [igRecap, ttRecap] = await Promise.all([
        collectLikesRecap(CLIENT_ID, { selfOnly: false }),
        collectKomentarRecap(CLIENT_ID, { selfOnly: false }),
      ]);

      let igRecapBuffer = null;
      let igRecapName = null;
      if (igRecap?.shortcodes?.length) {
        igRecapPath = await saveLikesRecapPerContentExcel(igRecap, CLIENT_ID);
        igRecapBuffer = await readFile(igRecapPath);
        igRecapName = basename(igRecapPath);
      }

      let ttRecapBuffer = null;
      let ttRecapName = null;
      if (ttRecap?.videoIds?.length) {
        ttRecapPath = await saveCommentRecapExcel(ttRecap, CLIENT_ID);
        ttRecapBuffer = await readFile(ttRecapPath);
        ttRecapName = basename(ttRecapPath);
      }

      const shouldSendReminder = igRecapBuffer || ttRecapBuffer;
      const reminderMessage = shouldSendReminder
        ? "Rekap harian: likes Instagram dan komentar TikTok."
        : null;

      for (const wa of recipients) {
        if (reminderMessage) {
          await safeSendMessage(waGatewayClient, wa, reminderMessage);
        }
        if (igRecapBuffer) {
          await sendWAFile(
            waGatewayClient,
            igRecapBuffer,
            igRecapName,
            wa,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
        }
        if (ttRecapBuffer) {
          await sendWAFile(
            waGatewayClient,
            ttRecapBuffer,
            ttRecapName,
            wa,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
        }
      }

      sendDebug({
        tag: "CRON DIRREQ ALL SOCMED",
        msg: `Laporan dikirim ke ${recipients.size} penerima${
          hasClientRecipients ? "" : " (fallback admin)"
        }`,
      });
    } finally {
      if (igRecapPath) {
        await unlink(igRecapPath).catch(() => {});
      }
      if (ttRecapPath) {
        await unlink(ttRecapPath).catch(() => {});
      }
    }
  } catch (err) {
    sendDebug({
      tag: "CRON DIRREQ ALL SOCMED",
      msg: `[ERROR] ${err.message || err}`,
    });
  }
}

export const JOB_KEY = "./src/cron/cronDirRequestRekapAllSocmed.js";
