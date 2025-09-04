import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";
import { absensiLikes } from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { getAdminWAIds } from "../utils/waHelper.js";

const cronTag = "CRON DIRREQUEST ABSENSI LIKES";
const dirRequestGroup = "120363419830216549@g.us";
const dirRequestNumber = "6281234560377@c.us";

async function runAbsensi(chatIds) {
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
    const msg = await absensiLikes("DITBINMAS", {
      mode: "all",
      roleFlag: "ditbinmas",
      clientFilter: "DITBINMAS",
    });
    if (msg) {
      for (const wa of chatIds) {
        await waClient.sendMessage(wa, msg).catch(() => {});
      }
      sendDebug({ tag: cronTag, msg: `Laporan absensi IG dikirim ke ${chatIds.length} target` });
    }
  } catch (err) {
    sendDebug({ tag: cronTag, msg: `[ERROR] ${err.message || err}` });
  }
}

const options = { timezone: "Asia/Jakarta" };

cron.schedule("12 15 * * *", () => runAbsensi([dirRequestGroup]), options);
cron.schedule("12 18 * * *", () => runAbsensi([dirRequestGroup]), options);
cron.schedule(
  "12 20 * * *",
  () => runAbsensi([dirRequestGroup, dirRequestNumber, ...getAdminWAIds()]),
  options
);
cron.schedule(
  "12 22 * * 4",
  () => runAbsensi([dirRequestGroup, dirRequestNumber, ...getAdminWAIds()]),
  options
);

export default null;
