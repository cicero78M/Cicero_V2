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
export const DITBINMAS_RECAP_JOB_KEY = `${JOB_KEY}#ditbinmas-recap`;
export const BIDHUMAS_2030_JOB_KEY = `${JOB_KEY}#bidhumas-20-30`;

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

function getRecipientsFromField(rawValue) {
  return splitRecipientField(rawValue).map(toWAid).filter(Boolean);
}

function getSuperAdminRecipients(client) {
  return getRecipientsFromField(client?.client_super);
}

function getOperatorRecipients(client) {
  return getRecipientsFromField(client?.client_operator);
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

function normalizeActionEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return { action: entry, context: undefined };
  }
  if (typeof entry === 'object' && entry.action) {
    return { action: String(entry.action), context: entry.context };
  }
  return null;
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
    for (const actionEntry of actions) {
      const normalizedAction = normalizeActionEntry(actionEntry);
      if (!normalizedAction?.action) {
        failures.push(`[${label}] action tidak valid untuk ${clientId} -> ${wa}`);
        continue;
      }
      try {
        sendDebug({
          tag: 'CRON DIRREQ CUSTOM',
          msg: `[${label}] jalankan menu ${normalizedAction.action} untuk ${clientId} -> ${wa}`,
        });
        await runDirRequestAction({
          action: normalizedAction.action,
          clientId,
          chatId: wa,
          roleFlag,
          userClientId,
          waClient: waGatewayClient,
          context: normalizedAction.context,
        });
      } catch (err) {
        const errorMsg = `[${label}] gagal menu ${normalizedAction.action} untuk ${clientId} -> ${wa}: ${err.message || err}`;
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

export async function runBidhumasMenuSequence({
  includeFetch = false,
  label = 'Menu 6 & 9 BIDHUMAS',
} = {}) {
  let fetchStatus = includeFetch ? 'pending' : 'skipped';
  let sendStatus = 'pending';

  if (includeFetch) {
    try {
      await runDirRequestFetchSosmed();
      fetchStatus = 'sosmed fetch selesai';
    } catch (err) {
      fetchStatus = `gagal sosmed fetch: ${err.message || err}`;
      sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: fetchStatus });
      await logToAdmins(fetchStatus);
    }
  }

  try {
    const bidhumasClient = await findClientById(BIDHUMAS_CLIENT_ID);
    const recipients = buildRecipients(bidhumasClient, {
      includeGroup: true,
      includeSuperAdmins: true,
    });

    sendStatus = await executeMenuActions({
      clientId: BIDHUMAS_CLIENT_ID,
      actions: ['6', '9'],
      recipients,
      label,
      userClientId: BIDHUMAS_CLIENT_ID,
      roleFlag: BIDHUMAS_CLIENT_ID,
    });
  } catch (err) {
    sendStatus = `gagal kirim BIDHUMAS: ${err.message || err}`;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: sendStatus });
    await logToAdmins(sendStatus);
  }

  return { fetchStatus, sendStatus };
}

function isLastDayOfMonth(date = new Date()) {
  const checkDate = new Date(date);
  const nextDay = new Date(checkDate);
  nextDay.setDate(checkDate.getDate() + 1);
  return checkDate.getMonth() !== nextDay.getMonth();
}

function buildDitbinmasRecapPlan(referenceDate = new Date()) {
  const recapPeriods = new Set(['daily']);
  const kasatkerPeriods = new Set(['today']);

  if (referenceDate.getDay() === 0) {
    recapPeriods.add('weekly');
    kasatkerPeriods.add('this_week');
  }

  if (isLastDayOfMonth(referenceDate)) {
    recapPeriods.add('monthly');
    kasatkerPeriods.add('this_month');
  }

  const contextByPeriod = (period) => ({ period, referenceDate });

  return {
    recapPeriods: Array.from(recapPeriods),
    kasatkerPeriods: Array.from(kasatkerPeriods),
    superActions: [
      { action: '6' },
      { action: '9' },
      ...Array.from(recapPeriods).map((period) => ({
        action: '34',
        context: contextByPeriod(period),
      })),
      ...Array.from(recapPeriods).map((period) => ({
        action: '35',
        context: contextByPeriod(period),
      })),
    ],
    operatorActions: Array.from(kasatkerPeriods).map((period) => ({
      action: '30',
      context: { period },
    })),
  };
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
    const { sendStatus } = await runBidhumasMenuSequence({ label: 'Menu 6 & 9 BIDHUMAS' });
    summary.bidhumas = sendStatus;
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

export async function runDitbinmasRecapSequence(referenceDate = new Date()) {
  sendDebug({
    tag: 'CRON DIRREQ CUSTOM',
    msg: 'Mulai cron rekap Ditbinmas (menu 21 + 6/9/30/34/35)',
  });

  const summary = {
    menu21: 'pending',
    superAdmins: 'pending',
    operators: 'pending',
  };

  try {
    const ditbinmasClient = await findClientById(DITBINMAS_CLIENT_ID);
    const { recapPeriods, kasatkerPeriods, superActions, operatorActions } =
      buildDitbinmasRecapPlan(referenceDate);

    const groupRecipients = buildRecipients(ditbinmasClient, { includeGroup: true });
    summary.menu21 = await executeMenuActions({
      clientId: DITBINMAS_CLIENT_ID,
      actions: ['21'],
      recipients: groupRecipients,
      label: 'Ditbinmas group (21)',
      userClientId: DITBINMAS_CLIENT_ID,
    });

    const superRecipients = getSuperAdminRecipients(ditbinmasClient);
    summary.superAdmins = await executeMenuActions({
      clientId: DITBINMAS_CLIENT_ID,
      actions: superActions,
      recipients: superRecipients,
      label: `Ditbinmas super admin (6,9,34,35 ${recapPeriods.join('/')})`,
      roleFlag: DITBINMAS_CLIENT_ID,
      userClientId: DITBINMAS_CLIENT_ID,
    });

    const operatorRecipients = getOperatorRecipients(ditbinmasClient);
    summary.operators = await executeMenuActions({
      clientId: DITBINMAS_CLIENT_ID,
      actions: operatorActions,
      recipients: operatorRecipients,
      label: `Ditbinmas operator (30 ${kasatkerPeriods.join('/')})`,
      roleFlag: DITBINMAS_CLIENT_ID,
      userClientId: DITBINMAS_CLIENT_ID,
    });
  } catch (err) {
    const errorMsg = `gagal menjalankan cron rekap Ditbinmas: ${err.message || err}`;
    summary.menu21 = errorMsg;
    summary.superAdmins = errorMsg;
    summary.operators = errorMsg;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: errorMsg });
    await logToAdmins(errorMsg);
  }

  const logMessage =
    '[CRON DIRREQ CUSTOM] Ringkasan Ditbinmas 20:30:\n' +
    `- Grup (21): ${summary.menu21}\n` +
    `- Super admin: ${summary.superAdmins}\n` +
    `- Operator: ${summary.operators}`;

  sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary });
  await logToAdmins(logMessage);
}

export default null;
