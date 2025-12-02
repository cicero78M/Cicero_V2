import dotenv from "dotenv";
dotenv.config();

import { waGatewayClient } from "../service/waService.js";
import { findAllActiveDirektoratWithSosmed } from "../model/clientModel.js";
import { getInstaPostCount, getTiktokPostCount } from "../service/postCountService.js";
import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";
import { fetchAndStoreTiktokContent } from "../handler/fetchpost/tiktokFetchPost.js";
import { handleFetchKomentarTiktokBatch } from "../handler/fetchengagement/fetchCommentTiktok.js";
import { generateSosmedTaskMessage } from "../handler/fetchabsensi/sosmedTask.js";
import { getAdminWAIds, safeSendMessage } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { getVideoIdsTodayByClient } from "../model/tiktokPostModel.js";

const lastStateByClient = new Map();
const adminRecipients = new Set(getAdminWAIds());

function getCurrentHourInJakarta(date = new Date()) {
  const hourString = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    hour: "numeric",
    hour12: false,
  }).format(date);

  return Number.parseInt(hourString, 10);
}

function normalizeGroupId(groupId) {
  if (!groupId) return null;
  const trimmed = String(groupId).trim();
  return trimmed.endsWith("@g.us") ? trimmed : null;
}

function normalizeUserId(contact) {
  if (!contact) return null;
  const digits = String(contact).replace(/\D/g, "");
  if (!digits) return null;

  const normalized = digits.startsWith("62") ? digits : "62" + digits.replace(/^0/, "");
  return `${normalized}@c.us`;
}

function getRecipientsForClient(client) {
  const clientId = String(client?.client_id || "").trim().toUpperCase();
  const recipients = new Set();

  const waGroup = normalizeGroupId(client?.client_group);
  const superAdmin = normalizeUserId(client?.client_super);
  const operator = normalizeUserId(client?.client_operator);

  if (clientId === "BIDHUMAS") {
    [superAdmin, operator].filter(Boolean).forEach((id) => recipients.add(id));
  } else if (clientId === "DITBINMAS") {
    if (waGroup) {
      recipients.add(waGroup);
    }
  } else if (waGroup) {
    recipients.add(waGroup);
  }

  return recipients;
}

async function sendAdminLog(message) {
  if (!message || adminRecipients.size === 0) return;
  const text = `[CRON DIRFETCH SOSMED] ${message}`;

  for (const admin of adminRecipients) {
    await safeSendMessage(waGatewayClient, admin, text.trim());
  }
}

async function ensureClientState(clientId) {
  const normalizedId = String(clientId || "").trim().toUpperCase();
  if (lastStateByClient.has(normalizedId)) {
    return lastStateByClient.get(normalizedId);
  }

  const [igCount, tiktokCount] = await Promise.all([
    getInstaPostCount(normalizedId),
    getTiktokPostCount(normalizedId),
  ]);

  const initialState = {
    igCount,
    tiktokCount,
    igShortcodes: [],
    tiktokVideoIds: [],
  };

  lastStateByClient.set(normalizedId, initialState);
  return initialState;
}

export async function runCron() {
  sendDebug({ tag: "CRON DIRFETCH SOSMED", msg: "Mulai cron dirrequest fetch sosmed" });
  try {
    await sendAdminLog("Mulai cron dirrequest fetch sosmed");

    const jakartaHour = getCurrentHourInJakarta();
    const skipPostFetch = jakartaHour >= 17;
    const activeClients = await findAllActiveDirektoratWithSosmed();

    if (skipPostFetch) {
      sendDebug({
        tag: "CRON DIRFETCH SOSMED",
        msg: "Lewati fetch post Instagram dan TikTok setelah pukul 17.00 WIB",
      });
      await sendAdminLog("Lewati fetch post Instagram dan TikTok setelah pukul 17.00 WIB");
    }

    if (activeClients.length === 0) {
      sendDebug({
        tag: "CRON DIRFETCH SOSMED",
        msg: "Tidak ada client direktorat aktif dengan IG & TikTok aktif",
      });
      await sendAdminLog("Tidak ada client direktorat aktif dengan IG & TikTok aktif");
      return;
    }

    for (const client of activeClients) {
      try {
        const clientId = String(client.client_id || "").trim().toUpperCase();
        const previousState = await ensureClientState(clientId);
        const previousIgShortcodes = await getShortcodesTodayByClient(clientId);
        const previousTiktokVideoIds = await getVideoIdsTodayByClient(clientId);

        if (!skipPostFetch) {
          await fetchAndStoreInstaContent(
            ["shortcode", "caption", "like_count", "timestamp"],
            null,
            null,
            clientId
          );
          await fetchAndStoreTiktokContent(clientId);
        }

        await handleFetchLikesInstagram(null, null, clientId);
        await handleFetchKomentarTiktokBatch(null, null, clientId);

        const { text, igCount, tiktokCount, state } = await generateSosmedTaskMessage(clientId, {
          skipTiktokFetch: true,
          skipLikesFetch: true,
          previousState: {
            igShortcodes: previousIgShortcodes,
            tiktokVideoIds: previousTiktokVideoIds,
          },
        });

        const recipients = getRecipientsForClient(client);
        const hasNewCounts =
          igCount !== previousState.igCount || tiktokCount !== previousState.tiktokCount;

        const nextState = {
          igCount,
          tiktokCount,
          igShortcodes: state?.igShortcodes ?? previousIgShortcodes ?? previousState.igShortcodes,
          tiktokVideoIds:
            state?.tiktokVideoIds ?? previousTiktokVideoIds ?? previousState.tiktokVideoIds,
        };

        lastStateByClient.set(clientId, nextState);

        if (!hasNewCounts) {
          await sendAdminLog(`[${clientId}] Tidak ada perubahan post, laporan tidak dikirim`);
          continue;
        }

        if (recipients.size === 0) {
          sendDebug({
            tag: "CRON DIRFETCH SOSMED",
            msg: `[${clientId}] Lewati pengiriman karena tidak ada penerima yang valid`,
          });
          await sendAdminLog(
            `[${clientId}] Lewati pengiriman karena tidak ada penerima yang valid`
          );
          continue;
        }

        for (const wa of recipients) {
          await safeSendMessage(waGatewayClient, wa, text.trim());
        }
        sendDebug({
          tag: "CRON DIRFETCH SOSMED",
          msg: `[${clientId}] Laporan dikirim ke ${recipients.size} penerima`,
        });
        await sendAdminLog(`[${clientId}] Laporan dikirim ke ${recipients.size} penerima`);
      } catch (clientErr) {
        sendDebug({
          tag: "CRON DIRFETCH SOSMED",
          msg: `[${client.client_id}] ERROR: ${clientErr.message || clientErr}`,
        });
        await sendAdminLog(`[${client.client_id}] ERROR: ${clientErr.message || clientErr}`);
      }
    }
  } catch (err) {
    sendDebug({
      tag: "CRON DIRFETCH SOSMED",
      msg: `[ERROR] ${err.message || err}`,
    });
    await sendAdminLog(`[ERROR] ${err.message || err}`);
  }
}

export const JOB_KEY = "./src/cron/cronDirRequestFetchSosmed.js";
