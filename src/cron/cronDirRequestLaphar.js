import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { lapharDitbinmas } from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import { sendWAFile, getAdminWAIds } from "../utils/waHelper.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";

const cronTag = "CRON DIRREQUEST LAPHAR";
const dirRequestGroup = "120363419830216549@g.us";
const dirRequestNumber = "6281234560377@c.us";

async function sendLaphar(chatIds) {
  sendDebug({ tag: cronTag, msg: "Mulai rekap laphar dirrequest" });
  try {
    await handleFetchLikesInstagram(null, null, "DITBINMAS");
    const {
      text,
      filename,
      narrative,
      textBelum,
      filenameBelum,
    } = await lapharDitbinmas();
    const buffer = Buffer.from(text, "utf-8");
    await sendWAFile(waClient, buffer, filename, chatIds);
    if (textBelum && filenameBelum) {
      const bufferBelum = Buffer.from(textBelum, "utf-8");
      await sendWAFile(waClient, bufferBelum, filenameBelum, chatIds);
    }
    for (const wa of chatIds) {
      await waClient
        .sendMessage(wa, narrative || "✅ Laphar Ditbinmas dikirim.")
        .catch(() => {});
    }
    sendDebug({
      tag: cronTag,
      msg: `Laphar dirrequest dikirim ke ${chatIds.length} target`,
    });
  } catch (err) {
    sendDebug({ tag: cronTag, msg: `[ERROR] ${err.message || err}` });
  }
}

const options = { timezone: "Asia/Jakarta" };

cron.schedule(
  "0 15 * * *",
  async () => {
    await sendLaphar([dirRequestGroup]);
  },
  options
);

cron.schedule(
  "0 18 * * *",
  async () => {
    await sendLaphar([dirRequestGroup]);
  },
  options
);

cron.schedule(
  "30 20 * * *",
  async () => {
    await sendLaphar([dirRequestGroup]);
  },
  options
);

cron.schedule(
  "30 20 * * *",
  async () => {
    await sendLaphar([dirRequestNumber, ...getAdminWAIds()]);
  },
  options
);

export default null;
