import { sendDebug } from '../middleware/debugHandler.js';
import { runDirRequestAction } from '../handler/menu/dirRequestHandlers.js';
import { findClientById } from '../service/clientService.js';
import { splitRecipientField } from '../repository/clientContactRepository.js';
import { safeSendMessage, getAdminWAIds } from '../utils/waHelper.js';
import { waGatewayClient } from '../service/waService.js';
import { delayAfterSend } from './dirRequestThrottle.js';
import { runCron as runDirRequestFetchSosmed } from './cronDirRequestFetchSosmed.js';

const DITBINMAS_CLIENT_ID = 'DITBINMAS';
export const JOB_KEY = './src/cron/cronDirRequestCustomSequence.js';
export const DITBINMAS_RECAP_JOB_KEY = `${JOB_KEY}#ditbinmas-recap`;

function validateDirektoratClient(client, clientId) {
  if (!client) {
    return { valid: false, reason: `Client ${clientId} tidak ditemukan` };
  }

  if (!client.client_status) {
    return { valid: false, reason: `Client ${clientId} tidak aktif` };
  }

  if (String(client.client_type || '').toLowerCase() !== 'direktorat') {
    return {
      valid: false,
      reason: `Client ${clientId} bukan bertipe direktorat (${client.client_type})`,
    };
  }

  return { valid: true, reason: null };
}

function toWAid(id) {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('@c.us') || trimmed.endsWith('@g.us')) return trimmed;
  return trimmed.replace(/\D/g, '') + '@c.us';
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

  recipientsLoop: for (let recipientIndex = 0; recipientIndex < recipients.length; recipientIndex += 1) {
    const wa = recipients[recipientIndex];

    for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
      const actionEntry = actions[actionIndex];
      const normalizedAction = normalizeActionEntry(actionEntry);
      if (!normalizedAction?.action) {
        const invalidMsg = `[${label}] action tidak valid untuk clientId=${clientId} recipient=${wa}`;
        failures.push(invalidMsg);
        await logToAdmins(invalidMsg);
        continue;
      }
      const contextText = normalizedAction.context
        ? ` context=${JSON.stringify(normalizedAction.context)}`
        : '';
      const actionPrefix = `[${label}] clientId=${clientId} recipient=${wa} action=${normalizedAction.action}`;
      try {
        const startMsg = `${actionPrefix} mulai${contextText ? ` (${contextText.trim()})` : ''}`;
        sendDebug({
          tag: 'CRON DIRREQ CUSTOM',
          msg: startMsg,
        });
        await logToAdmins(startMsg);
        await runDirRequestAction({
          action: normalizedAction.action,
          clientId,
          chatId: wa,
          roleFlag,
          userClientId,
          waClient: waGatewayClient,
          context: normalizedAction.context,
        });
        const successMsg = `${actionPrefix} sukses${contextText ? ` (${contextText.trim()})` : ''}`;
        await logToAdmins(successMsg);
      } catch (err) {
        const failureMsg = `${actionPrefix} gagal${contextText ? ` (${contextText.trim()})` : ''}: ${
          err.message || err
        }`;
        failures.push(failureMsg);
        sendDebug({
          tag: 'CRON DIRREQ CUSTOM',
          msg: `${failureMsg}. detail=${err.stack || err}`,
        });
        await logToAdmins(failureMsg);

        if (err?.message?.includes('GatewayResponseError: Rate limit exceeded')) {
          break recipientsLoop;
        }
      }

      const isLastRecipient = recipientIndex === recipients.length - 1;
      const isLastAction = actionIndex === actions.length - 1;
      if (!isLastRecipient || !isLastAction) {
        await delayAfterSend();
      }
    }
  }

  const summary = failures.length
    ? `${label}: ${recipients.length} penerima, ${failures.length} kegagalan`
    : `${label}: ${recipients.length} penerima berhasil`;

  await logToAdmins(failures.length ? `${summary}\n${failures.join('\n')}` : summary);
  return summary;
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

async function runDitbinmasActions({ referenceDate = new Date(), labelPrefix = 'Ditbinmas' } = {}) {
  const summary = {
    superAdmins: 'pending',
    operators: 'pending',
  };

  const ditbinmasClient = await findClientById(DITBINMAS_CLIENT_ID);
  const { valid, reason } = validateDirektoratClient(ditbinmasClient, DITBINMAS_CLIENT_ID);

  if (!valid) {
    const invalidMsg = `${labelPrefix}: ${reason}`;
    summary.superAdmins = reason;
    summary.operators = reason;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: invalidMsg });
    await logToAdmins(invalidMsg);
    return summary;
  }

  const { recapPeriods, kasatkerPeriods, superActions, operatorActions } =
    buildDitbinmasRecapPlan(referenceDate);

  const superRecipients = getSuperAdminRecipients(ditbinmasClient);
  await logToAdmins(
    `${labelPrefix}: mulai blok super admin (6/9/34/35 ${recapPeriods.join('/')})`
  );
  summary.superAdmins = await executeMenuActions({
    clientId: DITBINMAS_CLIENT_ID,
    actions: superActions,
    recipients: superRecipients,
    label: `${labelPrefix} super admin (6,9,34,35 ${recapPeriods.join('/')})`,
    roleFlag: DITBINMAS_CLIENT_ID,
    userClientId: DITBINMAS_CLIENT_ID,
  });
  await logToAdmins(`${labelPrefix}: selesai blok super admin: ${summary.superAdmins}`);

  const operatorRecipients = getOperatorRecipients(ditbinmasClient);
  if (superRecipients.length > 0 && operatorRecipients.length > 0) {
    await delayAfterSend();
  }
  await logToAdmins(`${labelPrefix}: mulai blok operator (30 ${kasatkerPeriods.join('/')})`);
  summary.operators = await executeMenuActions({
    clientId: DITBINMAS_CLIENT_ID,
    actions: operatorActions,
    recipients: operatorRecipients,
    label: `${labelPrefix} operator (30 ${kasatkerPeriods.join('/')})`,
    roleFlag: DITBINMAS_CLIENT_ID,
    userClientId: DITBINMAS_CLIENT_ID,
  });
  await logToAdmins(`${labelPrefix}: selesai blok operator: ${summary.operators}`);

  return summary;
}

export async function runCron({
  includeFetch = true,
  referenceDate = new Date(),
  summaryTitle = '[CRON DIRREQ CUSTOM] Ringkasan Ditbinmas',
} = {}) {
  sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: 'Mulai urutan cron custom dirrequest (Ditbinmas-only)' });

  const summary = {
    fetch: includeFetch ? 'pending' : 'dilewati (tidak dijadwalkan)',
    superAdmins: 'pending',
    operators: 'pending',
  };

  if (includeFetch) {
    await logToAdmins('Mulai cron custom dirrequest: blok runDirRequestFetchSosmed');
    try {
      await runDirRequestFetchSosmed();
      summary.fetch = 'sosmed fetch selesai';
      await logToAdmins('Selesai blok runDirRequestFetchSosmed');
    } catch (err) {
      summary.fetch = `gagal sosmed fetch: ${err.message || err}`;
      sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary.fetch });
      await logToAdmins(summary.fetch);
    }
  }

  try {
    const { superAdmins, operators } = await runDitbinmasActions({
      referenceDate,
      labelPrefix: 'Ditbinmas (6/9/30/34/35)',
    });
    summary.superAdmins = superAdmins;
    summary.operators = operators;
  } catch (err) {
    const errorMsg = `gagal kirim Ditbinmas: ${err.message || err}`;
    summary.superAdmins = errorMsg;
    summary.operators = errorMsg;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: errorMsg });
    await logToAdmins(errorMsg);
  }

  const logMessage =
    `${summaryTitle}:\n` +
    `- Fetch sosmed: ${summary.fetch}\n` +
    `- Ditbinmas super admin (6/9/34/35): ${summary.superAdmins}\n` +
    `- Ditbinmas operator (30): ${summary.operators}`;

  sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary });
  await logToAdmins(logMessage);
}

export async function runDitbinmasRecapSequence(referenceDate = new Date()) {
  sendDebug({
    tag: 'CRON DIRREQ CUSTOM',
    msg: 'Mulai cron rekap Ditbinmas (menu 6/9/30/34/35)',
  });
  await logToAdmins('Mulai cron rekap Ditbinmas (menu 6/9/30/34/35)');

  const summary = {
    superAdmins: 'pending',
    operators: 'pending',
  };

  try {
    const { superAdmins, operators } = await runDitbinmasActions({
      referenceDate,
      labelPrefix: 'Ditbinmas 20:30',
    });
    summary.superAdmins = superAdmins;
    summary.operators = operators;
  } catch (err) {
    const errorMsg = `gagal menjalankan cron rekap Ditbinmas: ${err.message || err}`;
    summary.superAdmins = errorMsg;
    summary.operators = errorMsg;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: errorMsg });
    await logToAdmins(errorMsg);
  }

  const logMessage =
    '[CRON DIRREQ CUSTOM] Ringkasan Ditbinmas 20:30:\n' +
    `- Super admin (6/9/34/35): ${summary.superAdmins}\n` +
    `- Operator (30): ${summary.operators}`;

  sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary });
  await logToAdmins(logMessage);
}

export default null;
