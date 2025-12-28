import * as dashboardPremiumRequestModel from '../model/dashboardPremiumRequestModel.js';
import * as dashboardUserModel from '../model/dashboardUserModel.js';
import * as dashboardSubscriptionService from './dashboardSubscriptionService.js';
import waClient, { waitForWaReady } from './waService.js';
import { formatToWhatsAppId, getAdminWAIds, safeSendMessage } from '../utils/waHelper.js';

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const DEFAULT_TIER = 'premium';
const DEFAULT_DURATION_DAYS = 30;

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

function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim() : '';
}

function computeExpiresAt(durationDays = DEFAULT_DURATION_DAYS) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + durationDays);
  return expiresAt.toISOString();
}

function resolveDashboardWhatsapp(request, dashboardUser) {
  return dashboardUser?.whatsapp || request?.whatsapp || null;
}

function formatExpiryLabel(expiresAt) {
  if (!expiresAt) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta',
    }).format(new Date(expiresAt));
  } catch (err) {
    return expiresAt;
  }
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

async function findDashboardUserFromRequest(request, username) {
  if (request?.dashboard_user_id) {
    const user = await dashboardUserModel.findById(request.dashboard_user_id);
    if (user) {
      return user;
    }
  }

  if (username) {
    return dashboardUserModel.findByUsername(username);
  }

  return null;
}

export async function findPendingRequestWithUser(username) {
  const normalized = normalizeUsername(username);
  const request = await dashboardPremiumRequestModel.findLatestPendingByUsername(normalized);
  if (!request) {
    return { request: null, dashboardUser: null };
  }
  const dashboardUser = await findDashboardUserFromRequest(request, normalized);
  return { request, dashboardUser };
}

export async function approvePendingRequest({
  username,
  adminWhatsapp,
  adminChatId,
  tier = DEFAULT_TIER,
  durationDays = DEFAULT_DURATION_DAYS,
} = {}) {
  const { request, dashboardUser } = await findPendingRequestWithUser(username);
  if (!request) {
    return { status: 'not_found', request: null, dashboardUser: null };
  }
  if (!dashboardUser) {
    return { status: 'dashboard_user_missing', request, dashboardUser: null };
  }

  const expiresAt = computeExpiresAt(durationDays);
  const { subscription, cache } = await dashboardSubscriptionService.createSubscription({
    dashboard_user_id: dashboardUser.dashboard_user_id,
    tier,
    expires_at: expiresAt,
    metadata: {
      request_id: request.request_id,
      approved_via: 'wa_command',
    },
  });

  const updatedRequest = await dashboardPremiumRequestModel.updateStatus(
    request.request_id,
    'approved',
  );

  await dashboardPremiumRequestModel.insertAuditLog({
    requestId: request.request_id,
    action: 'approved',
    adminWhatsapp,
    adminChatId,
    note: `Approved via WA (${tier})`,
  });

  return {
    status: 'approved',
    request: updatedRequest,
    dashboardUser,
    subscription,
    cache,
    expiresAt,
    applicantWhatsapp: resolveDashboardWhatsapp(request, dashboardUser),
  };
}

export async function rejectPendingRequest({ username, adminWhatsapp, adminChatId } = {}) {
  const { request, dashboardUser } = await findPendingRequestWithUser(username);
  if (!request) {
    return { status: 'not_found', request: null, dashboardUser: null };
  }

  const updatedRequest = await dashboardPremiumRequestModel.updateStatus(
    request.request_id,
    'rejected',
  );

  await dashboardPremiumRequestModel.insertAuditLog({
    requestId: request.request_id,
    action: 'rejected',
    adminWhatsapp,
    adminChatId,
    note: 'Rejected via WA',
  });

  const applicantWhatsapp = resolveDashboardWhatsapp(request, dashboardUser);

  return {
    status: 'rejected',
    request: updatedRequest,
    dashboardUser,
    applicantWhatsapp,
    expiryLabel: updatedRequest?.expires_at ? formatExpiryLabel(updatedRequest.expires_at) : null,
  };
}
