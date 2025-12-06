import { readFile, unlink } from 'fs/promises';
import { sendDebug } from '../middleware/debugHandler.js';
import { lapharDitbinmas, collectLikesRecap } from '../handler/fetchabsensi/insta/absensiLikesInsta.js';
import { lapharTiktokDitbinmas, collectKomentarRecap } from '../handler/fetchabsensi/tiktok/absensiKomentarTiktok.js';
import { absensiKomentarDitbinmasSimple } from '../handler/fetchabsensi/tiktok/absensiKomentarTiktok.js';
import { absensiLikesDitbinmasSimple } from '../handler/fetchabsensi/insta/absensiLikesInsta.js';
import { formatRekapAllSosmed } from '../handler/menu/dirRequestHandlers.js';
import { saveLikesRecapExcel } from '../service/likesRecapExcelService.js';
import { saveCommentRecapExcel } from '../service/commentRecapExcelService.js';
import { findClientById } from '../service/clientService.js';
import { splitRecipientField } from '../repository/clientContactRepository.js';
import { safeSendMessage, sendWAFile, getAdminWAIds } from '../utils/waHelper.js';
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
    getSuperAdminRecipients(client).forEach(wa => recipients.add(wa));
  }

  return Array.from(recipients);
}

async function sendDitbinmasCombinedRecap() {
  const client = await findClientById(DITBINMAS_CLIENT_ID);
  const recipients = buildRecipients(client, { includeGroup: true });

  if (recipients.length === 0) {
    return 'Tidak ada grup WA Ditbinmas yang valid';
  }

  const [ig, tt] = await Promise.all([
    lapharDitbinmas(DITBINMAS_CLIENT_ID),
    lapharTiktokDitbinmas(DITBINMAS_CLIENT_ID),
  ]);

  const clientName = client?.nama || DITBINMAS_CLIENT_ID;
  const narrative = await formatRekapAllSosmed(ig.narrative, tt.narrative, clientName, DITBINMAS_CLIENT_ID, {
    igRankingData: ig.rankingData,
    ttRankingData: tt.rankingData,
  });

  const igRecap = await collectLikesRecap(DITBINMAS_CLIENT_ID);
  let igRecapPayload = null;
  if (igRecap.shortcodes.length) {
    const excelPath = await saveLikesRecapExcel(igRecap, DITBINMAS_CLIENT_ID);
    const bufferExcel = await readFile(excelPath);
    igRecapPayload = {
      buffer: bufferExcel,
      filename: excelPath.split('/').pop(),
    };
    await unlink(excelPath);
  }

  const ttRecap = await collectKomentarRecap(DITBINMAS_CLIENT_ID);
  let ttRecapPayload = null;
  if (ttRecap.videoIds.length) {
    const excelPath = await saveCommentRecapExcel(ttRecap, DITBINMAS_CLIENT_ID);
    const bufferExcel = await readFile(excelPath);
    ttRecapPayload = {
      buffer: bufferExcel,
      filename: excelPath.split('/').pop(),
    };
    await unlink(excelPath);
  }

  for (const wa of recipients) {
    if (narrative) {
      await safeSendMessage(waGatewayClient, wa, narrative.trim());
    }

    if (ig.text && ig.filename) {
      const buffer = Buffer.from(ig.text, 'utf-8');
      await sendWAFile(waGatewayClient, buffer, ig.filename, wa, 'text/plain');
    }

    if (igRecapPayload) {
      await sendWAFile(
        waGatewayClient,
        igRecapPayload.buffer,
        igRecapPayload.filename,
        wa,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    }

    if (tt.text && tt.filename) {
      const buffer = Buffer.from(tt.text, 'utf-8');
      await sendWAFile(waGatewayClient, buffer, tt.filename, wa, 'text/plain');
    }

    if (ttRecapPayload) {
      await sendWAFile(
        waGatewayClient,
        ttRecapPayload.buffer,
        ttRecapPayload.filename,
        wa,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    }
  }

  return `Rekap gabungan DITBINMAS dikirim ke ${recipients.length} penerima`;
}

async function sendBidhumasAbsensi() {
  const client = await findClientById(BIDHUMAS_CLIENT_ID);
  const recipients = buildRecipients(client, { includeGroup: true, includeSuperAdmins: true });

  if (recipients.length === 0) {
    return 'Tidak ada grup atau super admin BIDHUMAS yang valid';
  }

  const likesMessage = await absensiLikesDitbinmasSimple(BIDHUMAS_CLIENT_ID);
  const komentarMessage = await absensiKomentarDitbinmasSimple(BIDHUMAS_CLIENT_ID);

  for (const wa of recipients) {
    if (likesMessage) {
      await safeSendMessage(waGatewayClient, wa, likesMessage);
    }
    if (komentarMessage) {
      await safeSendMessage(waGatewayClient, wa, komentarMessage);
    }
  }

  return `Menu 6 dan 9 BIDHUMAS dikirim ke ${recipients.length} penerima`;
}

export async function runCron() {
  const adminRecipients = new Set(getAdminWAIds());
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
  }

  try {
    summary.ditbinmas = await sendDitbinmasCombinedRecap();
  } catch (err) {
    summary.ditbinmas = `gagal rekap DITBINMAS: ${err.message || err}`;
  }

  try {
    summary.bidhumas = await sendBidhumasAbsensi();
  } catch (err) {
    summary.bidhumas = `gagal kirim BIDHUMAS: ${err.message || err}`;
  }

  const logMessage =
    '[CRON DIRREQ CUSTOM] Ringkasan:\n' +
    `- Fetch sosmed: ${summary.fetch}\n` +
    `- Menu 21 DITBINMAS: ${summary.ditbinmas}\n` +
    `- Menu 6 & 9 BIDHUMAS: ${summary.bidhumas}`;

  sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary });

  for (const admin of adminRecipients) {
    await safeSendMessage(waGatewayClient, admin, logMessage);
  }
}

export default null;
