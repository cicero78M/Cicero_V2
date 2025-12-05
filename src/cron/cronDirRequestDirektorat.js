import dotenv from "dotenv";
dotenv.config();

import { waGatewayClient } from "../service/waService.js";
import {
  absensiLikesDitbinmasSimple,
  absensiKomentarDitbinmasSimple,
} from "../handler/menu/dirRequestHandlers.js";
import { safeSendMessage } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { buildClientRecipientSet } from "../utils/recipientHelper.js";
import { findAllActiveDirektoratWithSosmed } from "../model/clientModel.js";

const DEFAULT_RECIPIENT_OPTIONS = {
  includeAdmins: false,
  includeOperator: false,
  includeGroup: false,
  includeSuper: true,
};

async function resolveTargetClientIds(clientIds) {
  if (Array.isArray(clientIds) && clientIds.length) {
    return clientIds.filter((id) => Boolean(id)).map((id) => String(id).trim());
  }

  if (clientIds && typeof clientIds === "string" && clientIds.trim()) {
    return [clientIds.trim()];
  }

  const clients = await findAllActiveDirektoratWithSosmed();
  return clients.map(({ client_id }) => client_id).filter(Boolean);
}

function resolveRecipientOptions(clientId, recipientMode = "default") {
  if (recipientMode === "superOnly") {
    return DEFAULT_RECIPIENT_OPTIONS;
  }

  if (recipientMode === "groupOnly") {
    return { ...DEFAULT_RECIPIENT_OPTIONS, includeGroup: true, includeSuper: false };
  }

  if (recipientMode === "groupAndSuper") {
    return { ...DEFAULT_RECIPIENT_OPTIONS, includeGroup: true, includeSuper: true };
  }

  if (clientId === "BIDHUMAS") {
    return { ...DEFAULT_RECIPIENT_OPTIONS, includeGroup: true, includeSuper: true };
  }

  return DEFAULT_RECIPIENT_OPTIONS;
}

export async function runCron({ clientIds = null, recipientMode = "default" } = {}) {
  sendDebug({ tag: "CRON DIRREQ DIREKTORAT", msg: "Mulai cron dirrequest direktorat" });
  try {
    const targetClientIds = await resolveTargetClientIds(clientIds);

    if (!targetClientIds.length) {
      sendDebug({
        tag: "CRON DIRREQ DIREKTORAT",
        msg: "Tidak ada client direktorat aktif dengan Instagram dan TikTok yang siap diproses",
      });
      return;
    }

    for (const clientId of targetClientIds) {
      try {
        const recipientOptions = resolveRecipientOptions(clientId, recipientMode);
        const { recipients, hasClientRecipients } = await buildClientRecipientSet(clientId, recipientOptions);

        if (!recipients.size) {
          sendDebug({
            tag: "CRON DIRREQ DIREKTORAT",
            msg: `Tidak ada penerima WA yang valid untuk rekap absensi direktorat ${clientId}`,
          });
          continue;
        }

        const likesMsg = await absensiLikesDitbinmasSimple(clientId);
        const komentarMsg = await absensiKomentarDitbinmasSimple(clientId);
        for (const wa of recipients) {
          await safeSendMessage(waGatewayClient, wa, likesMsg.trim());
          await safeSendMessage(waGatewayClient, wa, komentarMsg.trim());
        }
        sendDebug({
          tag: "CRON DIRREQ DIREKTORAT",
          msg: `Laporan ${clientId} dikirim ke ${recipients.size} penerima WA${
            hasClientRecipients ? "" : " (fallback admin)"
          }`,
        });
      } catch (err) {
        sendDebug({
          tag: "CRON DIRREQ DIREKTORAT",
          msg: `[ERROR][${clientId}] ${err.message || err}`,
        });
      }
    }
  } catch (err) {
    sendDebug({
      tag: "CRON DIRREQ DIREKTORAT",
      msg: `[ERROR] ${err.message || err}`,
    });
  }
}

export const JOB_KEY = "./src/cron/cronDirRequestDirektorat.js";

