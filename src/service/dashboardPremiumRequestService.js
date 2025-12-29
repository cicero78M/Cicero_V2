import * as dashboardPremiumRequestModel from '../model/dashboardPremiumRequestModel.js';
import * as dashboardPremiumAuditModel from '../model/dashboardPremiumAuditModel.js';
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
  const tier = request?.premium_tier || request?.premiumTier || '-';
  const clientId = request?.client_id || request?.clientId;
  const username =
    request?.username ||
    request?.resolved_username ||
    request?.metadata?.resolved_username ||
    request?.submitted_username ||
    '-';
  const dashboardUserId = request?.dashboard_user_id || request?.dashboardUserId || '-';

  return (
    `📢 ${header}\n\n` +
    `User dashboard:\n` +
    `- Username: ${dashboardUser?.username || '-'}\n` +
    `- WhatsApp: ${whatsappId}\n` +
    `- Dashboard User ID: ${dashboardUser?.dashboard_user_id || dashboardUserId}\n\n` +
    `Detail permintaan:\n` +
    `- Tier: ${tier}\n` +
    `- Client ID: ${clientId || '-'}\n` +
    `- Username (request): ${username}\n` +
    `- Dashboard User ID (request): ${dashboardUserId}\n\n` +
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

function normalizeDashboardUserId(dashboardUserId) {
  if (!dashboardUserId) return null;
  if (typeof dashboardUserId === 'string') {
    const trimmed = dashboardUserId.trim();
    return trimmed || null;
  }
  return dashboardUserId;
}

function computeExpiresAt(durationDays = DEFAULT_DURATION_DAYS) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + durationDays);
  return expiresAt.toISOString();
}

function nowISOString() {
  return new Date().toISOString();
}

function resolveActorLabel({ adminChatId, adminWhatsapp, fallback = 'system' } = {}) {
  if (adminChatId) return `wa_admin:${adminChatId}`;
  if (adminWhatsapp) return `wa_admin:${adminWhatsapp}`;
  return fallback;
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

export async function recordStatusChange({
  request,
  nextStatus,
  actor,
  reason,
  adminWhatsapp = null,
  respondedAt = null,
  expiredAt = null,
  enforcePending = false,
}) {
  if (!request?.request_id) {
    return { request: null, audit: null };
  }

  const updatePayload = {
    requestId: request.request_id,
    status: nextStatus,
    adminWhatsapp,
    respondedAt: respondedAt || (nextStatus !== 'pending' ? nowISOString() : null),
    expiredAt: expiredAt || (nextStatus === 'expired' ? nowISOString() : null),
  };

  const updateFn = enforcePending
    ? dashboardPremiumRequestModel.updateStatusIfPending
    : dashboardPremiumRequestModel.updateStatus;

  const updatedRequest = await updateFn(updatePayload);

  if (!updatedRequest) {
    return { request: null, audit: null };
  }

  const audit = await dashboardPremiumAuditModel.insertAuditEntry({
    requestId: updatedRequest.request_id,
    dashboardUserId: updatedRequest.dashboard_user_id,
    action: 'status_change',
    actor: actor || 'system',
    reason,
    statusFrom: request.status,
    statusTo: nextStatus,
    adminWhatsapp,
  });

  return { request: updatedRequest, audit };
}

export async function createPremiumAccessRequest({
  dashboardUser,
  bankName,
  accountNumber,
  senderName,
  transferAmount,
  premiumTier,
  clientId,
  submittedUsername,
  rawAmountField,
  username,
  sessionContext = {},
}) {
  const resolvedUsername = normalizeUsername(username || dashboardUser.username);
  const normalizedDashboardUserId = normalizeDashboardUserId(dashboardUser?.dashboard_user_id);
  const metadata = {
    submitted_username: submittedUsername || null,
    resolved_username: resolvedUsername || null,
    submitted_amount_field: rawAmountField ?? null,
    client_id: clientId || null,
    dashboard_user_id: normalizedDashboardUserId,
    premium_tier: premiumTier || null,
  };

  const request = await dashboardPremiumRequestModel.createRequest({
    dashboardUserId: normalizedDashboardUserId,
    userId: dashboardUser.user_id || null,
    username: resolvedUsername,
    whatsapp: dashboardUser.whatsapp || null,
    bankName,
    accountNumber,
    senderName,
    transferAmount,
    premiumTier,
    clientId,
    metadata,
    status: 'pending',
    sessionContext,
  });

  await dashboardPremiumAuditModel.insertAuditEntry({
    requestId: request.request_id,
    dashboardUserId: request.dashboard_user_id || normalizedDashboardUserId,
    action: 'created',
    actor: dashboardUser?.username ? `dashboard_user:${dashboardUser.username}` : 'dashboard_user',
    reason: 'Permintaan premium dikirim melalui dashboard',
    statusFrom: null,
    statusTo: request.status,
    adminWhatsapp: dashboardUser?.whatsapp || request?.whatsapp || null,
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

  const { request: updatedRequest } = await recordStatusChange({
    request,
    nextStatus: 'approved',
    actor: resolveActorLabel({ adminChatId, adminWhatsapp, fallback: 'wa_admin' }),
    reason: `Approved via WA (${tier})`,
    adminWhatsapp,
    enforcePending: true,
  });

  return {
    status: updatedRequest ? 'approved' : 'already_processed',
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

  const { request: updatedRequest } = await recordStatusChange({
    request,
    nextStatus: 'rejected',
    actor: resolveActorLabel({ adminChatId, adminWhatsapp, fallback: 'wa_admin' }),
    reason: 'Rejected via WA',
    adminWhatsapp,
    enforcePending: true,
  });

  const applicantWhatsapp = resolveDashboardWhatsapp(request, dashboardUser);

  return {
    status: updatedRequest ? 'rejected' : 'already_processed',
    request: updatedRequest,
    dashboardUser,
    applicantWhatsapp,
    expiryLabel: updatedRequest?.expires_at ? formatExpiryLabel(updatedRequest.expires_at) : null,
  };
}
