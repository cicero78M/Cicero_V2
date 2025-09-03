import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";
import { absensiLikes } from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";

const groupId = "120363419830216549@g.us";
const cronTag = "CRON DIRREQUEST ABSENSI LIKES";

cron.schedule(
  "50 14,17,19 * * *",
  async () => {
    sendDebug({ tag: cronTag, msg: "Mulai fetch & absensi IG DITBINMAS" });
    try {
      const keys = ["shortcode", "caption", "like_count", "timestamp"];
      await fetchAndStoreInstaContent(keys, null, null, "DITBINMAS");
      const shortcodes = await getShortcodesTodayByClient("DITBINMAS");
      if (shortcodes.length === 0) {
        sendDebug({ tag: cronTag, msg: "Tidak ada tugas IG hari ini" });
        return;
      }
      await handleFetchLikesInstagram(null, null, "DITBINMAS");
      const msg = await absensiLikes("DITBINMAS", { mode: "all", roleFlag: "ditbinmas" });
      if (msg) {
        await waClient.sendMessage(groupId, msg).catch(() => {});
        sendDebug({ tag: cronTag, msg: "Laporan absensi IG dikirim" });
      }
    } catch (err) {
      sendDebug({ tag: cronTag, msg: `[ERROR] ${err.message || err}` });
    }
  },
  { timezone: "Asia/Jakarta" }
);

export default null;
