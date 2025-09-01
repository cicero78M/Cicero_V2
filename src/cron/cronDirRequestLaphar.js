import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { lapharDitbinmas } from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import { sendWAFile, getAdminWhatsAppList } from "../utils/waHelper.js";

const cronTag = "CRON DIRREQUEST LAPHAR";

cron.schedule(
  "55 17,19 * * *",
  async () => {
    sendDebug({ tag: cronTag, msg: "Mulai rekap laphar dirrequest" });
    try {
      const { text, filename, narrative } = await lapharDitbinmas();
      const buffer = Buffer.from(text, "utf-8");
      await sendWAFile(waClient, buffer, filename);
      const admins = getAdminWhatsAppList();
      for (const wa of admins) {
        await waClient
          .sendMessage(wa, narrative || "✅ Laphar Ditbinmas dikirim.")
          .catch(() => {});
      }
      sendDebug({
        tag: cronTag,
        msg: `Laphar dirrequest dikirim ke ${admins.length} admin`,
      });
    } catch (err) {
      sendDebug({ tag: cronTag, msg: `[ERROR] ${err.message || err}` });
    }
  },
  { timezone: "Asia/Jakarta" }
);

export default null;
