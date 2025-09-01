import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { formatRekapUserData } from "../handler/menu/dirRequestHandlers.js";

const cronTag = "CRON DIRREQUEST DITBINMAS";

export async function runCron() {
  sendDebug({ tag: cronTag, msg: "Mulai rekap user belum lengkapi data Ditbinmas" });
  try {
    const msg = await formatRekapUserData("ditbinmas", "ditbinmas");
    await waClient
      .sendMessage("120363419830216549@g.us", msg)
      .catch(() => {});
    sendDebug({ tag: cronTag, msg: "Rekap dikirim ke grup Ditbinmas" });
  } catch (err) {
    sendDebug({ tag: cronTag, msg: `[ERROR] ${err.message}` });
  }
}

cron.schedule("0 6-21 * * *", runCron, { timezone: "Asia/Jakarta" });

export default null;
