import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { lapharDitbinmas, absensiLikes } from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import { sendWAFile, safeSendMessage, getAdminWAIds } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const DIRREQUEST_GROUP = "120363419830216549@g.us";
const REKAP_RECIPIENT = "6281234560377@c.us";

function getRecipients(includeRekap = false) {
  const recipients = new Set([...getAdminWAIds(), DIRREQUEST_GROUP]);
  if (includeRekap) {
    recipients.add(REKAP_RECIPIENT);
  }
  return recipients;
}

export async function runCron(includeRekap = false) {
  sendDebug({ tag: "CRON DIRREQ LAPHAR", msg: "Mulai cron dirrequest laphar" });
  try {
    const recipients = getRecipients(includeRekap);

    const { text, filename, narrative, textBelum, filenameBelum } = await lapharDitbinmas();
    const dirPath = "laphar";
    await mkdir(dirPath, { recursive: true });
    for (const wa of recipients) {
      if (narrative) {
        await safeSendMessage(waClient, wa, narrative.trim());
      }
      if (text && filename) {
        const buffer = Buffer.from(text, "utf-8");
        const filePath = join(dirPath, filename);
        await writeFile(filePath, buffer);
        await sendWAFile(waClient, buffer, filename, wa, "text/plain");
      }
      if (textBelum && filenameBelum) {
        const bufferBelum = Buffer.from(textBelum, "utf-8");
        const filePathBelum = join(dirPath, filenameBelum);
        await writeFile(filePathBelum, bufferBelum);
        await sendWAFile(waClient, bufferBelum, filenameBelum, wa, "text/plain");
      }
    }

    const absensiMsg = await absensiLikes("DITBINMAS", { mode: "all", roleFlag: "ditbinmas" });
    for (const wa of recipients) {
      await safeSendMessage(waClient, wa, absensiMsg.trim());
    }

    sendDebug({ tag: "CRON DIRREQ LAPHAR", msg: `Laporan dikirim ke ${recipients.size} penerima` });
  } catch (err) {
    sendDebug({ tag: "CRON DIRREQ LAPHAR", msg: `[ERROR] ${err.message || err}` });
  }
}

cron.schedule("0 15,18 * * *", () => runCron(false), { timezone: "Asia/Jakarta" });
cron.schedule("30 20 * * *", () => runCron(true), { timezone: "Asia/Jakarta" });

export default null;
