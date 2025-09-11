import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import {
  lapharDitbinmas,
  collectLikesRecap,
} from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import {
  lapharTiktokDitbinmas,
  collectKomentarRecap,
} from "../handler/fetchabsensi/tiktok/absensiKomentarTiktok.js";
import { saveLikesRecapExcel } from "../service/likesRecapExcelService.js";
import { saveCommentRecapExcel } from "../service/commentRecapExcelService.js";
import { formatRekapAllSosmed } from "../handler/menu/dirRequestHandlers.js";
import { sendWAFile, safeSendMessage, getAdminWAIds } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join, basename } from "path";

const DIRREQUEST_GROUP = "120363419830216549@g.us";
const REKAP_RECIPIENT = "6281234560377@c.us";
const CLIENT_ID = "DITBINMAS";

function getRecipients(includeRekap = false) {
  const recipients = new Set([...getAdminWAIds(), DIRREQUEST_GROUP]);
  if (includeRekap) {
    recipients.add(REKAP_RECIPIENT);
  }
  return recipients;
}

export async function runCron(includeRekap = false) {
  sendDebug({
    tag: "CRON DIRREQ ALL SOCMED",
    msg: "Mulai cron dirrequest rekap all socmed",
  });
  try {
    const recipients = getRecipients(includeRekap);
    const dirPath = "laphar";
    await mkdir(dirPath, { recursive: true });

    const [ig, tt, igRecap, ttRecap] = await Promise.all([
      lapharDitbinmas(),
      lapharTiktokDitbinmas(),
      collectLikesRecap(CLIENT_ID),
      collectKomentarRecap(CLIENT_ID),
    ]);

    const narrative = formatRekapAllSosmed(ig.narrative, tt.narrative);

    const igBuffer = ig.text && ig.filename ? Buffer.from(ig.text, "utf-8") : null;
    const igBelumBuffer =
      ig.textBelum && ig.filenameBelum
        ? Buffer.from(ig.textBelum, "utf-8")
        : null;
    const ttBuffer = tt.text && tt.filename ? Buffer.from(tt.text, "utf-8") : null;
    const ttBelumBuffer =
      tt.textBelum && tt.filenameBelum
        ? Buffer.from(tt.textBelum, "utf-8")
        : null;

    let igRecapPath = null;
    let igRecapBuffer = null;
    let igRecapName = null;
    if (igRecap.shortcodes.length) {
      igRecapPath = await saveLikesRecapExcel(igRecap, CLIENT_ID);
      igRecapBuffer = await readFile(igRecapPath);
      igRecapName = basename(igRecapPath);
    }

    let ttRecapPath = null;
    let ttRecapBuffer = null;
    let ttRecapName = null;
    if (ttRecap.videoIds.length) {
      ttRecapPath = await saveCommentRecapExcel(ttRecap, CLIENT_ID);
      ttRecapBuffer = await readFile(ttRecapPath);
      ttRecapName = basename(ttRecapPath);
    }

    if (igBuffer) {
      const filePath = join(dirPath, ig.filename);
      await writeFile(filePath, igBuffer);
    }
    if (igBelumBuffer) {
      const filePathBelum = join(dirPath, ig.filenameBelum);
      await writeFile(filePathBelum, igBelumBuffer);
    }
    if (ttBuffer) {
      const filePath = join(dirPath, tt.filename);
      await writeFile(filePath, ttBuffer);
    }
    if (ttBelumBuffer) {
      const filePathBelum = join(dirPath, tt.filenameBelum);
      await writeFile(filePathBelum, ttBelumBuffer);
    }

    for (const wa of recipients) {
      if (narrative) {
        await safeSendMessage(waClient, wa, narrative.trim());
      }
      if (igBuffer) {
        await sendWAFile(waClient, igBuffer, ig.filename, wa, "text/plain");
      }
      if (igBelumBuffer) {
        await sendWAFile(
          waClient,
          igBelumBuffer,
          ig.filenameBelum,
          wa,
          "text/plain"
        );
      }
      if (ttBuffer) {
        await sendWAFile(waClient, ttBuffer, tt.filename, wa, "text/plain");
      }
      if (ttBelumBuffer) {
        await sendWAFile(
          waClient,
          ttBelumBuffer,
          tt.filenameBelum,
          wa,
          "text/plain"
        );
      }
      if (igRecapBuffer) {
        await sendWAFile(
          waClient,
          igRecapBuffer,
          igRecapName,
          wa,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
      }
      if (ttRecapBuffer) {
        await sendWAFile(
          waClient,
          ttRecapBuffer,
          ttRecapName,
          wa,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
      }
    }

    if (igRecapPath) {
      await unlink(igRecapPath);
    }
    if (ttRecapPath) {
      await unlink(ttRecapPath);
    }

    sendDebug({
      tag: "CRON DIRREQ ALL SOCMED",
      msg: `Laporan dikirim ke ${recipients.size} penerima`,
    });
  } catch (err) {
    sendDebug({
      tag: "CRON DIRREQ ALL SOCMED",
      msg: `[ERROR] ${err.message || err}`,
    });
  }
}

cron.schedule("0 15,18 * * *", () => runCron(false), { timezone: "Asia/Jakarta" });
cron.schedule("30 20 * * *", () => runCron(true), { timezone: "Asia/Jakarta" });

export default null;
