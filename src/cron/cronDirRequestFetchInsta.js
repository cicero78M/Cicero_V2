import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";
import { rekapLikesIG } from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import { safeSendMessage } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";

const DIRREQUEST_GROUP = "120363419830216549@g.us";

function toWAid(id) {
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith("@c.us") || trimmed.endsWith("@g.us")) return trimmed;
  return trimmed.replace(/\D/g, "") + "@c.us";
}

function getAdminWAIds() {
  return (process.env.ADMIN_WHATSAPP || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map(toWAid)
    .filter(Boolean);
}

export async function runCron() {
  sendDebug({ tag: "CRON DIRFETCH IG", msg: "Mulai cron dirrequest fetch insta" });
  try {
    await fetchAndStoreInstaContent(
      ["shortcode", "caption", "like_count", "timestamp"],
      null,
      null,
      "DITBINMAS"
    );
    await handleFetchLikesInstagram(null, null, "DITBINMAS");
    const msg =
      (await rekapLikesIG("DITBINMAS")) ||
      "Tidak ada konten IG untuk DIREKTORAT BINMAS hari ini.";

    const recipients = new Set([...getAdminWAIds(), DIRREQUEST_GROUP]);
    for (const wa of recipients) {
      await safeSendMessage(waClient, wa, msg.trim());
    }

    sendDebug({
      tag: "CRON DIRFETCH IG",
      msg: `Laporan dikirim ke ${recipients.size} penerima`,
    });
  } catch (err) {
    sendDebug({
      tag: "CRON DIRFETCH IG",
      msg: `[ERROR] ${err.message || err}`,
    });
  }
}

cron.schedule("30 6 * * *", runCron, { timezone: "Asia/Jakarta" });
cron.schedule("0,30 7-21 * * *", runCron, { timezone: "Asia/Jakarta" });

export default null;

