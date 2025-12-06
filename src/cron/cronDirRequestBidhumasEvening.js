import { sendDebug } from '../middleware/debugHandler.js';
import { runDirRequestAction } from '../handler/menu/dirRequestHandlers.js';
import { findClientById } from '../service/clientService.js';
import { splitRecipientField } from '../repository/clientContactRepository.js';
import { safeSendMessage, getAdminWAIds } from '../utils/waHelper.js';
import { waGatewayClient } from '../service/waService.js';
import { normalizeGroupId, runCron as runDirRequestFetchSosmed } from './cronDirRequestFetchSosmed.js';
import { delayAfterSend } from './dirRequestThrottle.js';

const BIDHUMAS_CLIENT_ID = 'BIDHUMAS';
export const JOB_KEY = './src/cron/cronDirRequestBidhumasEvening.js';

const adminRecipients = new Set(getAdminWAIds());

function toWAid(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('@c.us') || trimmed.endsWith('@g.us')) return trimmed;
  return trimmed.replace(/\D/g, '') + '@c.us';
}

function getGroupRecipient(client) {
  return normalizeGroupId(client?.client_group);
}

function getSuperAdminRecipients(client) {
  return splitRecipientField(client?.client_super).map(toWAid).filter(Boolean);
}

function buildRecipients(client) {
  const recipients = new Set();
  const groupId = getGroupRecipient(client);
  if (groupId) {
    recipients.add(groupId);
  }
  getSuperAdminRecipients(client).forEach((wa) => recipients.add(wa));
  return Array.from(recipients);
}

async function logToAdmins(message) {
  if (!message || adminRecipients.size === 0) return;
  const prefix = '[CRON DIRREQ BIDHUMAS 22:00] ';
  for (const admin of adminRecipients) {
    await safeSendMessage(waGatewayClient, admin, `${prefix}${message}`);
  }
}

async function executeBidhumasMenus(recipients) {
  const actions = ['6', '9'];
  const failures = [];

  for (let recipientIndex = 0; recipientIndex < recipients.length; recipientIndex += 1) {
    const chatId = recipients[recipientIndex];

    for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
      const action = actions[actionIndex];
      try {
        sendDebug({
          tag: 'CRON DIRREQ BIDHUMAS 22:00',
          msg: `Jalankan menu ${action} untuk BIDHUMAS -> ${chatId}`,
        });
        await runDirRequestAction({
          action,
          clientId: BIDHUMAS_CLIENT_ID,
          chatId,
          roleFlag: BIDHUMAS_CLIENT_ID,
          userClientId: BIDHUMAS_CLIENT_ID,
          waClient: waGatewayClient,
        });
      } catch (err) {
        const errorMsg = `Gagal menu ${action} untuk ${chatId}: ${err.message || err}`;
        failures.push(errorMsg);
        sendDebug({ tag: 'CRON DIRREQ BIDHUMAS 22:00', msg: errorMsg });
      }

      const isLastRecipient = recipientIndex === recipients.length - 1;
      const isLastAction = actionIndex === actions.length - 1;
      if (!isLastRecipient || !isLastAction) {
        await delayAfterSend();
      }
    }
  }

  return failures;
}

export async function runCron() {
  sendDebug({ tag: 'CRON DIRREQ BIDHUMAS 22:00', msg: 'Mulai cron BIDHUMAS malam' });

  let fetchStatus = 'pending';
  let sendStatus = 'pending';

  try {
    await runDirRequestFetchSosmed();
    fetchStatus = 'sosmed fetch selesai';
  } catch (err) {
    fetchStatus = `gagal sosmed fetch: ${err.message || err}`;
    await logToAdmins(fetchStatus);
  }

  try {
    const client = await findClientById(BIDHUMAS_CLIENT_ID);
    const recipients = buildRecipients(client);

    if (recipients.length === 0) {
      sendStatus = 'tidak ada penerima valid untuk BIDHUMAS';
      await logToAdmins(sendStatus);
    } else {
      const failures = await executeBidhumasMenus(recipients);
      sendStatus =
        failures.length === 0
          ? `menu 6 & 9 dikirim ke ${recipients.length} penerima`
          : `menu 6 & 9 selesai dengan ${failures.length} kegagalan`;

      if (failures.length > 0) {
        await logToAdmins(`${sendStatus}\n${failures.join('\n')}`);
      }
    }
  } catch (err) {
    sendStatus = `gagal memproses BIDHUMAS: ${err.message || err}`;
    await logToAdmins(sendStatus);
  }

  await logToAdmins(`Ringkasan: ${fetchStatus}; ${sendStatus}`);
  sendDebug({ tag: 'CRON DIRREQ BIDHUMAS 22:00', msg: { fetchStatus, sendStatus } });
}

export default null;
