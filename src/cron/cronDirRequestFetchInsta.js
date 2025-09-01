import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";
import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";

async function getTodayInstaLinks(clientId) {
  const { query } = await import("../db/index.js");
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const res = await query(
    "SELECT shortcode FROM insta_post WHERE client_id = $1 AND DATE(created_at) = $2",
    [clientId, `${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map((r) => `https://www.instagram.com/p/${r.shortcode}`);
}

const groupId = "120363419830216549@g.us";
const cronTag = "CRON DIRREQUEST FETCH INSTA";

cron.schedule(
  "50 6-21 * * *",
  async () => {
    sendDebug({ tag: cronTag, msg: "Mulai fetch Instagram DITBINMAS" });
    try {
      const keys = ["shortcode", "caption", "like_count", "timestamp"];
      await fetchAndStoreInstaContent(keys, null, null, "DITBINMAS");
      const links = await getTodayInstaLinks("DITBINMAS");
      if (links.length > 0) {
        const header =
          `✅ Fetch Instagram DITBINMAS\nJumlah konten hari ini: *${links.length}*`;
        await waClient.sendMessage(groupId, header).catch(() => {});
        const maxPerMsg = 30;
        const totalMsg = Math.ceil(links.length / maxPerMsg);
        for (let i = 0; i < totalMsg; i++) {
          const chunk = links.slice(i * maxPerMsg, (i + 1) * maxPerMsg);
          await waClient
            .sendMessage(groupId, `Link konten Instagram:\n${chunk.join("\n")}`)
            .catch(() => {});
        }
        sendDebug({
          tag: cronTag,
          msg: `Kirim ${links.length} link ke group`,
        });
        try {
          sendDebug({ tag: cronTag, msg: "Mulai fetch likes IG" });
          await handleFetchLikesInstagram(null, null, "DITBINMAS");
          sendDebug({ tag: cronTag, msg: "Selesai fetch likes IG" });
        } catch (err) {
          sendDebug({
            tag: cronTag,
            msg: `[ERROR fetch likes] ${err.message || err}`,
          });
        }
      } else {
        sendDebug({ tag: cronTag, msg: "Tidak ada konten IG hari ini" });
      }
    } catch (err) {
      sendDebug({ tag: cronTag, msg: `[ERROR] ${err.message || err}` });
    }
  },
  { timezone: "Asia/Jakarta" }
);

export default null;
