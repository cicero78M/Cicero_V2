import dotenv from "dotenv";
dotenv.config();

import { waGatewayClient } from "../service/waService.js";
import {
  lapharDitbinmas,
  collectLikesRecap,
} from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import {
  lapharTiktokDitbinmas,
  collectKomentarRecap,
} from "../handler/fetchabsensi/tiktok/absensiKomentarTiktok.js";
import { saveLikesRecapPerContentExcel } from "../service/likesRecapExcelService.js";
import { saveCommentRecapExcel } from "../service/commentRecapExcelService.js";
import { formatRekapAllSosmed } from "../handler/menu/dirRequestHandlers.js";
import { sendWAFile, safeSendMessage } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join, basename } from "path";
import { buildClientRecipientSet } from "../utils/recipientHelper.js";

const CLIENT_ID = "DITBINMAS";

export async function runCron() {
  const shouldArchive = process.env.LAPHAR_ARCHIVE === "true";
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
  let igPath = null;
  let ttPath = null;
  try {
    try {
      const dirPath = "laphar";
      if (shouldArchive) {
        await mkdir(dirPath, { recursive: true });
      }

      const [ig, tt, igRecap, ttRecap] = await Promise.all([
        lapharDitbinmas(),
        lapharTiktokDitbinmas(),
        collectLikesRecap(CLIENT_ID, { selfOnly: false }),
        collectKomentarRecap(CLIENT_ID, { selfOnly: false }),
      ]);

      const narrative = formatRekapAllSosmed(ig.narrative, tt.narrative);

      const igBuffer =
        ig.text && ig.filename ? Buffer.from(ig.text, "utf-8") : null;
      const ttBuffer =
        tt.text && tt.filename ? Buffer.from(tt.text, "utf-8") : null;

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

      if (shouldArchive && igBuffer) {
        igPath = join(dirPath, ig.filename);
        await writeFile(igPath, igBuffer);
      }
      if (shouldArchive && ttBuffer) {
        ttPath = join(dirPath, tt.filename);
        await writeFile(ttPath, ttBuffer);
      }

      for (const wa of recipients) {
        if (narrative) {
          await safeSendMessage(waGatewayClient, wa, narrative.trim());
        }
        if (igBuffer) {
          await sendWAFile(waGatewayClient, igBuffer, ig.filename, wa, "text/plain");
        }
        if (ttBuffer) {
          await sendWAFile(waGatewayClient, ttBuffer, tt.filename, wa, "text/plain");
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
      if (igPath) {
        await unlink(igPath).catch(() => {});
      }
      if (ttPath) {
        await unlink(ttPath).catch(() => {});
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
