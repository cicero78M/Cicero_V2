import * as dashboardPremiumRequestModel from '../model/dashboardPremiumRequestModel.js';
import * as dashboardPremiumRequestAuditModel from '../model/dashboardPremiumRequestAuditModel.js';
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

function normalizeUuid(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  const serialized = String(value).trim();
  return serialized || null;
}

function normalizeDashboardUserId(dashboardUserId) {
  return normalizeUuid(dashboardUserId);
}

function normalizeWhatsapp(whatsapp) {
  if (typeof whatsapp === 'string') {
    const trimmed = whatsapp.trim();
    return trimmed || null;
  }
  return whatsapp || null;
}

function normalizeClientId(clientId) {
  if (clientId == null) return null;
  if (typeof clientId === 'string') {
    const trimmed = clientId.trim();
    return trimmed || null;
  }
  const serialized = String(clientId).trim();
  return serialized || null;
}

function sanitizeDashboardUser(dashboardUser = {}) {
  return {
    ...dashboardUser,
    dashboard_user_id: normalizeDashboardUserId(dashboardUser.dashboard_user_id),
    whatsapp: normalizeWhatsapp(dashboardUser.whatsapp),
    user_uuid: normalizeUuid(dashboardUser.user_uuid),
    username: normalizeUsername(dashboardUser.username) || null,
  };
}

function buildSessionContext({ clientId, dashboardUserId, userUuid, username } = {}) {
  return {
    clientId: normalizeClientId(clientId),
    dashboardUserId: normalizeDashboardUserId(dashboardUserId),
    userUuid: normalizeUuid(userUuid),
    username: normalizeUsername(username) || null,
  };
}

function computeExpiresAt(durationDays = DEFAULT_DURATION_DAYS) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + durationDays);
  return expiresAt.toISOString();
}

function nowISOString() {
  return new Date().toISOString();
}

function resolveDashboardWhatsapp(request, dashboardUser) {
  return normalizeWhatsapp(dashboardUser?.whatsapp || request?.whatsapp || null);
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

async function insertAuditEntrySafe({
  action,
  request,
  dashboardUser = null,
  sessionContext = {},
  adminWhatsapp = null,
  adminChatId = null,
  note = null,
}) {
  if (!request?.request_id) return null;

  const sanitizedDashboardUser = dashboardUser ? sanitizeDashboardUser(dashboardUser) : null;
  const auditSessionContext = buildSessionContext({
    clientId: sessionContext?.clientId ?? request?.client_id ?? null,
    dashboardUserId:
      sanitizedDashboardUser?.dashboard_user_id ??
      normalizeDashboardUserId(request?.dashboard_user_id),
    userUuid: sanitizedDashboardUser?.user_uuid ?? sessionContext?.userUuid,
    username:
      sessionContext?.username ||
      sanitizedDashboardUser?.username ||
      request?.username ||
      request?.resolved_username ||
      request?.metadata?.resolved_username ||
      request?.submitted_username,
  });

  try {
    return await dashboardPremiumRequestAuditModel.insertAuditEntry({
      requestId: request.request_id,
      action,
      adminWhatsapp,
      adminChatId,
      note,
      sessionContext: auditSessionContext,
    });
  } catch (err) {
    console.warn('[DashboardPremiumRequest] Failed to insert audit entry', {
      action,
      requestId: request?.request_id,
      error: err?.message || err,
    });
    return null;
  }
}

export async function recordStatusChange({
  request,
  nextStatus,
  adminWhatsapp = null,
  adminChatId = null,
  respondedAt = null,
  expiredAt = null,
  enforcePending = false,
  dashboardUser = null,
  sessionContext = {},
}) {
  if (!request?.request_id) {
    return { request: null };
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
    return { request: null };
  }

  await insertAuditEntrySafe({
    action: nextStatus,
    request: updatedRequest,
    dashboardUser,
    sessionContext,
    adminWhatsapp,
    adminChatId,
  });

  return { request: updatedRequest };
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
  const sanitizedDashboardUser = sanitizeDashboardUser(dashboardUser);
  const resolvedUsername = normalizeUsername(username || sanitizedDashboardUser.username);
  const sanitizedSessionContext = buildSessionContext({
    clientId,
    dashboardUserId: sanitizedDashboardUser.dashboard_user_id,
    userUuid: sanitizedDashboardUser.user_uuid,
    username: resolvedUsername,
  });
  const metadata = {
    submitted_username: submittedUsername || null,
    resolved_username: resolvedUsername || null,
    submitted_amount_field: rawAmountField ?? null,
    client_id: clientId || null,
    dashboard_user_id: sanitizedDashboardUser.dashboard_user_id,
    premium_tier: premiumTier || null,
  };

  const request = await dashboardPremiumRequestModel.createRequest({
    dashboardUserId: sanitizedDashboardUser.dashboard_user_id,
    username: resolvedUsername,
    whatsapp: sanitizedDashboardUser.whatsapp,
    bankName,
    accountNumber,
    senderName,
    transferAmount,
    premiumTier,
    clientId,
    metadata,
    status: 'pending',
    sessionContext: sanitizedSessionContext,
    userUuid: sanitizedDashboardUser.user_uuid,
  });

  await insertAuditEntrySafe({
    action: 'created',
    request,
    dashboardUser: sanitizedDashboardUser,
    sessionContext: sanitizedSessionContext,
  });

  const message = buildAdminNotification({
    dashboardUser: sanitizedDashboardUser,
    request,
  });
  const notification = await notifyAdmins(message);

  return { request, notification };
}

async function findDashboardUserFromRequest(request, username) {
  const normalizedDashboardUserId = normalizeDashboardUserId(request?.dashboard_user_id);
  if (normalizedDashboardUserId) {
    const user = await dashboardUserModel.findById(normalizedDashboardUserId);
    if (user) {
      return sanitizeDashboardUser(user);
    }
  }

  if (username) {
    const user = await dashboardUserModel.findByUsername(username);
    if (user) {
      return sanitizeDashboardUser(user);
    }
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
  adminChatId = null,
  tier = DEFAULT_TIER,
  durationDays = DEFAULT_DURATION_DAYS,
} = {}) {
  const { request, dashboardUser } = await findPendingRequestWithUser(username);
  if (!request) {
    return { status: 'not_found', request: null, dashboardUser: null };
  }
  const sanitizedDashboardUser = dashboardUser ? sanitizeDashboardUser(dashboardUser) : null;
  if (!sanitizedDashboardUser?.dashboard_user_id) {
    return { status: 'dashboard_user_missing', request, dashboardUser: null };
  }

  const expiresAt = computeExpiresAt(durationDays);
  const { subscription, cache } = await dashboardSubscriptionService.createSubscription({
    dashboard_user_id: sanitizedDashboardUser.dashboard_user_id,
    tier,
    expires_at: expiresAt,
    metadata: {
      request_id: request.request_id,
      approved_via: 'wa_command',
    },
  });

  const sessionContext = buildSessionContext({
    clientId: request?.client_id,
    dashboardUserId: sanitizedDashboardUser.dashboard_user_id,
    userUuid: sanitizedDashboardUser.user_uuid,
    username: sanitizedDashboardUser.username || request?.username,
  });

  const { request: updatedRequest } = await recordStatusChange({
    request,
    nextStatus: 'approved',
    adminWhatsapp,
    enforcePending: true,
    dashboardUser: sanitizedDashboardUser,
    sessionContext,
    adminChatId,
  });

  return {
    status: updatedRequest ? 'approved' : 'already_processed',
    request: updatedRequest,
    dashboardUser: sanitizedDashboardUser,
    subscription,
    cache,
    expiresAt,
    applicantWhatsapp: resolveDashboardWhatsapp(request, sanitizedDashboardUser),
  };
}

export async function rejectPendingRequest({ username, adminWhatsapp, adminChatId = null } = {}) {
  const { request, dashboardUser } = await findPendingRequestWithUser(username);
  if (!request) {
    return { status: 'not_found', request: null, dashboardUser: null };
  }

  const sanitizedDashboardUser = dashboardUser ? sanitizeDashboardUser(dashboardUser) : null;
  const sessionContext = buildSessionContext({
    clientId: request?.client_id,
    dashboardUserId: sanitizedDashboardUser?.dashboard_user_id,
    userUuid: sanitizedDashboardUser?.user_uuid,
    username: sanitizedDashboardUser?.username || request?.username,
  });

  const { request: updatedRequest } = await recordStatusChange({
    request,
    nextStatus: 'rejected',
    adminWhatsapp,
    enforcePending: true,
    dashboardUser: sanitizedDashboardUser,
    sessionContext,
    adminChatId,
  });

  const applicantWhatsapp = resolveDashboardWhatsapp(request, sanitizedDashboardUser);

  return {
    status: updatedRequest ? 'rejected' : 'already_processed',
    request: updatedRequest,
    dashboardUser: sanitizedDashboardUser,
    applicantWhatsapp,
    expiryLabel: updatedRequest?.expires_at ? formatExpiryLabel(updatedRequest.expires_at) : null,
  };
}
