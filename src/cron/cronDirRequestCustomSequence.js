import { sendDebug } from '../middleware/debugHandler.js';
import { runDirRequestAction } from '../handler/menu/dirRequestHandlers.js';
import { findClientById } from '../service/clientService.js';
import { splitRecipientField } from '../repository/clientContactRepository.js';
import { safeSendMessage, getAdminWAIds } from '../utils/waHelper.js';
import { waGatewayClient } from '../service/waService.js';
import {
  normalizeGroupId,
  runCron as runDirRequestFetchSosmed,
} from './cronDirRequestFetchSosmed.js';

const DITBINMAS_CLIENT_ID = 'DITBINMAS';
const BIDHUMAS_CLIENT_ID = 'BIDHUMAS';
export const JOB_KEY = './src/cron/cronDirRequestCustomSequence.js';

function toWAid(id) {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
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

function buildRecipients(client, { includeGroup = false, includeSuperAdmins = false } = {}) {
  const recipients = new Set();

  if (includeGroup) {
    const groupId = getGroupRecipient(client);
    if (groupId) {
      recipients.add(groupId);
    }
  }

  if (includeSuperAdmins) {
    getSuperAdminRecipients(client).forEach((wa) => recipients.add(wa));
  }

  return Array.from(recipients);
}

const adminRecipients = new Set(getAdminWAIds());

async function logToAdmins(message) {
  if (!message || adminRecipients.size === 0) return;
  const text = `[CRON DIRREQ CUSTOM] ${message}`;

  for (const admin of adminRecipients) {
    await safeSendMessage(waGatewayClient, admin, text);
  }
}

async function executeMenuActions({
  clientId,
  actions,
  recipients,
  label,
  roleFlag,
  userClientId,
}) {
  if (!recipients?.length) {
    const msg = `${label}: tidak ada penerima yang valid`;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg });
    await logToAdmins(msg);
    return msg;
  }

  const failures = [];

  for (const wa of recipients) {
    for (const action of actions) {
      try {
        sendDebug({
          tag: 'CRON DIRREQ CUSTOM',
          msg: `[${label}] jalankan menu ${action} untuk ${clientId} -> ${wa}`,
        });
        await runDirRequestAction({
          action,
          clientId,
          chatId: wa,
          roleFlag,
          userClientId,
          waClient: waGatewayClient,
        });
      } catch (err) {
        const errorMsg = `[${label}] gagal menu ${action} untuk ${clientId} -> ${wa}: ${err.message || err}`;
        failures.push(errorMsg);
        sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: errorMsg });
      }
    }
  }

  const summary = failures.length
    ? `${label}: ${recipients.length} penerima, ${failures.length} kegagalan`
    : `${label}: ${recipients.length} penerima berhasil`;

  await logToAdmins(failures.length ? `${summary}\n${failures.join('\n')}` : summary);
  return summary;
}

export async function runCron() {
  sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: 'Mulai urutan cron custom dirrequest' });

  const summary = {
    fetch: 'pending',
    ditbinmas: 'pending',
    bidhumas: 'pending',
  };

  try {
    await runDirRequestFetchSosmed();
    summary.fetch = 'sosmed fetch selesai';
  } catch (err) {
    summary.fetch = `gagal sosmed fetch: ${err.message || err}`;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary.fetch });
    await logToAdmins(summary.fetch);
  }

  try {
    const ditbinmasClient = await findClientById(DITBINMAS_CLIENT_ID);
    const recipients = buildRecipients(ditbinmasClient, { includeGroup: true });
    summary.ditbinmas = await executeMenuActions({
      clientId: DITBINMAS_CLIENT_ID,
      actions: ['21'],
      recipients,
      label: 'Menu 21 DITBINMAS',
      userClientId: DITBINMAS_CLIENT_ID,
    });
  } catch (err) {
    summary.ditbinmas = `gagal rekap DITBINMAS: ${err.message || err}`;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary.ditbinmas });
    await logToAdmins(summary.ditbinmas);
  }

  try {
    const bidhumasClient = await findClientById(BIDHUMAS_CLIENT_ID);
    const recipients = buildRecipients(bidhumasClient, {
      includeGroup: true,
      includeSuperAdmins: true,
    });
    summary.bidhumas = await executeMenuActions({
      clientId: BIDHUMAS_CLIENT_ID,
      actions: ['6', '9'],
      recipients,
      label: 'Menu 6 & 9 BIDHUMAS',
      userClientId: BIDHUMAS_CLIENT_ID,
    });
  } catch (err) {
    summary.bidhumas = `gagal kirim BIDHUMAS: ${err.message || err}`;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary.bidhumas });
    await logToAdmins(summary.bidhumas);
  }

  const logMessage =
    '[CRON DIRREQ CUSTOM] Ringkasan:\n' +
    `- Fetch sosmed: ${summary.fetch}\n` +
    `- Menu 21 DITBINMAS: ${summary.ditbinmas}\n` +
    `- Menu 6 & 9 BIDHUMAS: ${summary.bidhumas}`;

  sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary });
  await logToAdmins(logMessage);
}

export default null;
