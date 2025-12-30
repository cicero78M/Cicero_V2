import * as dashboardPremiumRequestModel from '../model/dashboardPremiumRequestModel.js';
import * as dashboardUserModel from '../model/dashboardUserModel.js';
import { formatToWhatsAppId, safeSendMessage } from '../utils/waHelper.js';
import { waGatewayClient, waitForWaReady } from './waService.js';
import { recordStatusChange } from './dashboardPremiumRequestService.js';

const DEFAULT_THRESHOLD_MINUTES = 60;

function normalizeWhatsapp(rawValue) {
  if (!rawValue) return null;
  try {
    return formatToWhatsAppId(rawValue);
  } catch (err) {
    return null;
  }
}

function buildExpiryMessage({ username, requestId, thresholdMinutes }) {
  const requestLine = requestId ? `\nRequest ID: ${requestId}` : '';
  return [
    '⏰ Permintaan akses premium dashboard Anda kedaluwarsa.',
    `Permintaan pending lebih dari ${thresholdMinutes} menit tanpa tindak lanjut admin.`,
    'Silakan kirim ulang bukti transfer atau ajukan permintaan baru.',
    `Username: ${username || '-'}` + requestLine,
  ].join('\n');
}

async function resolveDashboardUser(request) {
  if (request?.dashboard_user_id) {
    const user = await dashboardUserModel.findById(request.dashboard_user_id);
    if (user) return user;
  }
  if (request?.username) {
    return dashboardUserModel.findByUsername(request.username);
  }
  return null;
}

async function notifyApplicant(request, dashboardUser, thresholdMinutes) {
  const whatsapp = dashboardUser?.whatsapp || request?.whatsapp;
  const chatId = normalizeWhatsapp(whatsapp);
  if (!chatId) return false;

  try {
    await waitForWaReady();
  } catch (err) {
    console.warn(
      `[CRON] Skipping WA notice for expired request ${request?.request_id}: ${err?.message || err}`,
    );
    return false;
  }

  const message = buildExpiryMessage({
    username: request?.username || dashboardUser?.username,
    requestId: request?.request_id,
    thresholdMinutes,
  });

  return safeSendMessage(waGatewayClient, chatId, message);
}

export async function fetchStalePendingRequests(thresholdMinutes = DEFAULT_THRESHOLD_MINUTES) {
  return dashboardPremiumRequestModel.findPendingOlderThanMinutes(thresholdMinutes);
}

export async function expirePendingRequests({ thresholdMinutes = DEFAULT_THRESHOLD_MINUTES } = {}) {
  const pendingRequests = await fetchStalePendingRequests(thresholdMinutes);
  let expired = 0;
  let notified = 0;

  for (const request of pendingRequests) {
    try {
      const dashboardUser = await resolveDashboardUser(request);
      const { request: updatedRequest } = await recordStatusChange({
        request,
        nextStatus: 'expired',
        enforcePending: true,
      });

      if (!updatedRequest) {
        continue;
      }

      const sent = await notifyApplicant(updatedRequest, dashboardUser, thresholdMinutes);
      if (sent) {
        notified += 1;
      }

      expired += 1;
    } catch (err) {
      console.error(
        `[CRON] Failed to expire dashboard premium request ${request?.request_id}`,
        err,
      );
    }
  }

  return {
    checked: pendingRequests.length,
    expired,
    notified,
  };
}
