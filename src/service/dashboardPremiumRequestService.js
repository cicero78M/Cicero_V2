import * as dashboardPremiumRequestModel from '../model/dashboardPremiumRequestModel.js';
import waClient, { waitForWaReady } from './waService.js';
import { formatToWhatsAppId, getAdminWAIds, safeSendMessage } from '../utils/waHelper.js';

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function formatAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return rupiahFormatter.format(numeric);
}

function buildAdminRecipients() {
  const raw = (process.env.ADMIN_WHATSAPP || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  const formatted = raw
    .map(number => (number.endsWith('@c.us') ? number : formatToWhatsAppId(number)))
    .filter(Boolean);

  if (formatted.length > 0) return formatted;
  return getAdminWAIds();
}

export function buildAdminNotification({ dashboardUser, request }) {
  const header = 'permintaan akses premium';
  const whatsappId = dashboardUser?.whatsapp ? formatToWhatsAppId(dashboardUser.whatsapp) : '-';
  const amount = formatAmount(request?.transfer_amount ?? request?.transferAmount);
  const requestId = request?.request_id || request?.id || '-';

  return (
    `📢 ${header}\n\n` +
    `User dashboard:\n` +
    `- Username: ${dashboardUser?.username || '-'}\n` +
    `- WhatsApp: ${whatsappId}\n` +
    `- Dashboard User ID: ${dashboardUser?.dashboard_user_id || '-'}\n\n` +
    `Detail transfer:\n` +
    `- Bank: ${request?.bank_name || request?.bankName || '-'}\n` +
    `- Nomor Rekening: ${request?.account_number || request?.accountNumber || '-'}\n` +
    `- Nama Pengirim: ${request?.sender_name || request?.senderName || '-'}\n` +
    `- Jumlah Transfer: ${amount}\n\n` +
    `Request ID: ${requestId}`
  );
}

async function notifyAdmins(message) {
  const recipients = buildAdminRecipients();
  if (!recipients.length) {
    return { sent: false, recipients, error: 'ADMIN_WHATSAPP is empty' };
  }

  try {
    await waitForWaReady();
  } catch (err) {
    return { sent: false, recipients, error: err.message };
  }

  const results = [];
  for (const chatId of recipients) {
    const sent = await safeSendMessage(waClient, chatId, message);
    results.push({ chatId, sent });
  }

  const sent = results.some(r => r.sent);
  return { sent, recipients, results };
}

export async function createPremiumAccessRequest({
  dashboardUser,
  bankName,
  accountNumber,
  senderName,
  transferAmount,
}) {
  const request = await dashboardPremiumRequestModel.createRequest({
    dashboardUserId: dashboardUser.dashboard_user_id,
    userId: dashboardUser.user_id || null,
    username: dashboardUser.username,
    whatsapp: dashboardUser.whatsapp || null,
    bankName,
    accountNumber,
    senderName,
    transferAmount,
    status: 'pending',
  });

  const message = buildAdminNotification({ dashboardUser, request });
  const notification = await notifyAdmins(message);

  return { request, notification };
}
