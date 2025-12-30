import * as dashboardUserModel from '../model/dashboardUserModel.js';
import { createPremiumAccessRequest } from '../service/dashboardPremiumRequestService.js';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeClientId(value) {
  return typeof value === 'string' ? value.trim() : null;
}

function normalizeUuid(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return value;
}

function normalizeDashboardUserId(value) {
  return normalizeUuid(value);
}

function normalizeWhatsapp(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return value || null;
}

function buildSessionSettingsFromRequest(dashboardUserId, dashboardUserPayload = {}) {
  const clientIds = Array.isArray(dashboardUserPayload.client_ids)
    ? dashboardUserPayload.client_ids
    : [];
  const normalizedClientId =
    normalizeClientId(dashboardUserPayload.client_id || dashboardUserPayload.clientId) ||
    normalizeClientId(clientIds[0]);
  const normalizedDashboardUserId = normalizeDashboardUserId(dashboardUserId);

  return {
    'app.current_client_id': normalizedClientId || null,
    'app.current_dashboard_user_id': normalizedDashboardUserId || null,
    'app.current_user_uuid': normalizeUuid(dashboardUserPayload.user_uuid),
    'app.current_username': normalizeString(dashboardUserPayload.username) || null,
  };
}

function getAllowedClientIds({
  dashboardUserClientIds = [],
  tokenClientId,
  tokenClientIds = [],
}) {
  const normalizedDashboardClientIds = Array.isArray(dashboardUserClientIds)
    ? dashboardUserClientIds.map(normalizeClientId).filter(Boolean)
    : [];

  const normalizedTokenClientIds = [
    normalizeClientId(tokenClientId),
    ...(Array.isArray(tokenClientIds) ? tokenClientIds.map(normalizeClientId) : []),
  ].filter(Boolean);

  if (normalizedTokenClientIds.length === 0) {
    return normalizedDashboardClientIds;
  }

  const tokenClientIdSet = new Set(normalizedTokenClientIds.map(id => id.toLowerCase()));

  return normalizedDashboardClientIds.filter(id => tokenClientIdSet.has(id.toLowerCase()));
}

function resolveClientId({
  requestedClientId,
  tokenClientId,
  tokenClientIds = [],
  dashboardUserClientIds = [],
}) {
  const normalizedRequest = normalizeClientId(requestedClientId);
  if (normalizedRequest) {
    return normalizedRequest;
  }

  const normalizedTokenClientId = normalizeClientId(tokenClientId);
  if (normalizedTokenClientId) {
    return normalizedTokenClientId;
  }

  const normalizedTokenClientIds = Array.isArray(tokenClientIds)
    ? tokenClientIds.map(normalizeClientId).filter(Boolean)
    : [];
  if (normalizedTokenClientIds.length === 1) {
    return normalizedTokenClientIds[0];
  }

  const normalizedDashboardClientIds = Array.isArray(dashboardUserClientIds)
    ? dashboardUserClientIds.map(normalizeClientId).filter(Boolean)
    : [];
  if (normalizedDashboardClientIds.length === 1) {
    return normalizedDashboardClientIds[0];
  }

  return null;
}

function isClientAllowed(clientId, allowedClientIds = []) {
  if (!clientId) {
    return false;
  }

  const normalizedClientId = clientId.toLowerCase();
  const normalizedAllowed = Array.isArray(allowedClientIds)
    ? allowedClientIds.map(normalizeClientId).filter(Boolean).map(id => id.toLowerCase())
    : [];

  return normalizedAllowed.includes(normalizedClientId);
}

export async function getDashboardPremiumRequestContext(req, res, next) {
  try {
    const dashboardUserId = normalizeDashboardUserId(req.dashboardUser?.dashboard_user_id);
    if (!dashboardUserId) {
      return res.status(401).json({ success: false, message: 'Token dashboard tidak valid' });
    }

    const sessionSettings = buildSessionSettingsFromRequest(dashboardUserId, req.dashboardUser);
    const dashboardUser = await dashboardUserModel.findByIdWithSessionSettings(
      dashboardUserId,
      sessionSettings,
    );
    if (!dashboardUser) {
      return res.status(404).json({ success: false, message: 'Pengguna dashboard tidak ditemukan' });
    }

    return res.json({
      success: true,
      data: {
        username: dashboardUser.username,
        dashboard_user_id: dashboardUser.dashboard_user_id,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createDashboardPremiumRequest(req, res, next) {
  const dashboardUserIdFromToken = normalizeDashboardUserId(req.dashboardUser?.dashboard_user_id);
  const debugContext = {
    requestClientId: normalizeClientId(req.body?.client_id || req.body?.clientId),
    submittedUsername: normalizeString(req.body?.username),
    tokenClientId: normalizeClientId(req.dashboardUser?.client_id),
    tokenClientIds: Array.isArray(req.dashboardUser?.client_ids)
      ? req.dashboardUser.client_ids.map(normalizeClientId).filter(Boolean)
      : [],
    dashboardUserId: dashboardUserIdFromToken,
    bodyDashboardUserId: normalizeDashboardUserId(req.body?.dashboard_user_id),
  };

  let dashboardUser = null;
  let allowedClientIds = [];
  let resolvedClientId = null;
  let resolvedUsername = null;
  let sessionSettings = null;

  try {
    if (!dashboardUserIdFromToken) {
      return res.status(401).json({ success: false, message: 'Token dashboard tidak valid' });
    }

    if (
      debugContext.bodyDashboardUserId &&
      debugContext.bodyDashboardUserId !== dashboardUserIdFromToken
    ) {
      return res.status(400).json({
        success: false,
        message: 'dashboard_user_id harus mengikuti sesi dashboard yang aktif',
      });
    }

    const bankName = normalizeString(req.body.bank_name || req.body.bankName);
    const accountNumber = normalizeString(req.body.account_number || req.body.accountNumber);
    const senderName = normalizeString(req.body.sender_name || req.body.senderName);
    const transferAmountRaw =
      req.body.transfer_amount ?? req.body.transferAmount ?? req.body.amount;
    const transferAmount = Number(transferAmountRaw);
    const premiumTier = normalizeString(req.body.premium_tier || req.body.premiumTier);
    const clientId = normalizeString(req.body.client_id || req.body.clientId);
    const submittedUsername = normalizeString(req.body.username);

    if (!bankName || !accountNumber || !senderName || !transferAmountRaw) {
      return res.status(400).json({
        success: false,
        message: 'bank_name, account_number, sender_name, dan amount/transfer_amount wajib diisi',
      });
    }

    if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'transfer_amount tidak valid',
      });
    }

    sessionSettings = buildSessionSettingsFromRequest(dashboardUserIdFromToken, req.dashboardUser);
    dashboardUser = await dashboardUserModel.findByIdWithSessionSettings(
      dashboardUserIdFromToken,
      sessionSettings,
    );
    if (!dashboardUser) {
      return res.status(400).json({ success: false, message: 'dashboard_user_id tidak valid' });
    }

    const normalizedDashboardUserId = normalizeDashboardUserId(dashboardUser.dashboard_user_id);
    const normalizedDashboardWhatsapp = normalizeWhatsapp(dashboardUser.whatsapp);
    const normalizedUserUuid = normalizeUuid(dashboardUser.user_uuid);
    if (!normalizedDashboardUserId) {
      return res.status(400).json({ success: false, message: 'dashboard_user_id tidak valid' });
    }
    dashboardUser = {
      ...dashboardUser,
      dashboard_user_id: normalizedDashboardUserId,
      whatsapp: normalizedDashboardWhatsapp,
      user_uuid: normalizedUserUuid,
    };

    allowedClientIds = getAllowedClientIds({
      dashboardUserClientIds: dashboardUser?.client_ids,
      tokenClientId: req.dashboardUser?.client_id,
      tokenClientIds: req.dashboardUser?.client_ids,
    });

    resolvedClientId = resolveClientId({
      requestedClientId: clientId,
      tokenClientId: req.dashboardUser?.client_id,
      tokenClientIds: req.dashboardUser?.client_ids,
      dashboardUserClientIds: dashboardUser?.client_ids,
    });

    if (!resolvedClientId) {
      return res.status(400).json({
        success: false,
        message: 'client_id wajib diisi atau akun dashboard harus memiliki satu client aktif',
      });
    }

    if (!isClientAllowed(resolvedClientId, allowedClientIds)) {
      console.warn('[DashboardPremiumRequest] Rejected client_id for dashboard user', {
        dashboardUserId: dashboardUserIdFromToken,
        dashboardUsername: dashboardUser.username,
        requestedClientId: clientId,
        resolvedClientId,
        tokenClientId: req.dashboardUser?.client_id,
        tokenClientIds: req.dashboardUser?.client_ids,
        allowedClientIds,
      });
      return res.status(403).json({
        success: false,
        message: 'client_id tidak sesuai dengan akses dashboard user',
      });
    }

    const normalizedDashboardUsername = normalizeString(dashboardUser.username);
    resolvedUsername = submittedUsername || normalizedDashboardUsername;

    if (submittedUsername && normalizedDashboardUsername && submittedUsername !== normalizedDashboardUsername) {
      return res.status(403).json({
        success: false,
        message: 'username tidak sesuai dengan akun dashboard yang aktif',
      });
    }

    if (!resolvedUsername) {
      return res.status(400).json({
        success: false,
        message: 'username wajib diisi',
      });
    }

    const sessionContext = {
      clientId: resolvedClientId,
      dashboardUserId: dashboardUser.dashboard_user_id,
      username: resolvedUsername,
      userUuid: dashboardUser.user_uuid || null,
    };

    const { request, notification } = await createPremiumAccessRequest({
      dashboardUser,
      bankName,
      accountNumber,
      senderName,
      transferAmount,
      premiumTier,
      clientId: resolvedClientId,
      submittedUsername,
      rawAmountField: transferAmountRaw,
      username: resolvedUsername,
      sessionContext,
    });

    return res.status(201).json({
      success: true,
      data: {
        request,
        notification,
      },
    });
  } catch (err) {
    if (err?.code === '42501' && /row-level security/i.test(err.message || '')) {
      console.error('[DashboardPremiumRequest] RLS violation while creating premium request', {
        ...debugContext,
        error: err.message,
        code: err.code,
        dashboardUserId: dashboardUserIdFromToken,
        resolvedClientId,
        allowedClientIds,
        sessionSettings,
        resolvedUsername,
      });
      return res.status(403).json({
        success: false,
        message:
          'Akses client dashboard tidak valid untuk membuat permintaan premium. Periksa client_id pada token dan akses dashboard user.',
      });
    }
    next(err);
  }
}
