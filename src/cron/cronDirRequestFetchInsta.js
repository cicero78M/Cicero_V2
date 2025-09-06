import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";
import { rekapLikesIG } from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { safeSendMessage } from "../utils/waHelper.js";

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
  "22,52 6-19 * * *",
  async () => {
    sendDebug({ tag: cronTag, msg: "Mulai fetch Instagram DITBINMAS" });
    try {
      const keys = ["shortcode", "caption", "like_count", "timestamp"];
      await fetchAndStoreInstaContent(keys, null, null, "DITBINMAS");
      const links = await getTodayInstaLinks("DITBINMAS");
      if (links.length > 0) {
        const header =
          `✅ Fetch Instagram DITBINMAS\nJumlah konten hari ini: *${links.length}*`;
        const sentHeader = await safeSendMessage(waClient, groupId, header);
        if (!sentHeader)
          sendDebug({
            tag: cronTag,
            msg: "Gagal kirim pesan header ke group",
          });
        const maxPerMsg = 30;
        const totalMsg = Math.ceil(links.length / maxPerMsg);
        for (let i = 0; i < totalMsg; i++) {
          const chunk = links.slice(i * maxPerMsg, (i + 1) * maxPerMsg);
          const ok = await safeSendMessage(
            waClient,
            groupId,
            `Link konten Instagram:\n${chunk.join("\n")}`
          );
          if (!ok)
            sendDebug({
              tag: cronTag,
              msg: `Gagal kirim batch link IG ke group (${i + 1}/${totalMsg})`,
            });
        }
        sendDebug({
          tag: cronTag,
          msg: `Kirim ${links.length} link ke group`,
        });
      } else {
        const sent = await safeSendMessage(
          waClient,
          groupId,
          "Tidak ada konten IG untuk DIREKTORAT BINMAS hari ini."
        );
        if (!sent)
          sendDebug({
            tag: cronTag,
            msg: "Gagal kirim notifikasi tidak ada konten IG",
          });
        sendDebug({ tag: cronTag, msg: "Tidak ada konten IG hari ini" });
      }
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
      const rekapMsg = await rekapLikesIG("DITBINMAS");
      if (rekapMsg) {
        const okRekap = await safeSendMessage(waClient, groupId, rekapMsg);
        if (!okRekap)
          sendDebug({
            tag: cronTag,
            msg: "Gagal kirim pesan rekap likes IG",
          });
      }
    } catch (err) {
      sendDebug({ tag: cronTag, msg: `[ERROR] ${err.message || err}` });
    }
  },
  { timezone: "Asia/Jakarta" }
);

export default null;
