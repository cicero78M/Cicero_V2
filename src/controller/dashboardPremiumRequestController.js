import * as dashboardUserModel from '../model/dashboardUserModel.js';
import { createPremiumAccessRequest } from '../service/dashboardPremiumRequestService.js';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeClientId(value) {
  return typeof value === 'string' ? value.trim() : null;
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
    const dashboardUserId = req.dashboardUser?.dashboard_user_id;
    if (!dashboardUserId) {
      return res.status(401).json({ success: false, message: 'Token dashboard tidak valid' });
    }

    const dashboardUser = await dashboardUserModel.findById(dashboardUserId);
    if (!dashboardUser) {
      return res.status(404).json({ success: false, message: 'Pengguna dashboard tidak ditemukan' });
    }

    return res.json({
      success: true,
      data: {
        username: dashboardUser.username,
        dashboard_user_id: dashboardUser.dashboard_user_id,
        user_id: dashboardUser.user_id,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createDashboardPremiumRequest(req, res, next) {
  try {
    const dashboardUserId = req.dashboardUser?.dashboard_user_id;
    if (!dashboardUserId) {
      return res.status(401).json({ success: false, message: 'Token dashboard tidak valid' });
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

    const dashboardUser = await dashboardUserModel.findById(dashboardUserId);
    if (!dashboardUser) {
      return res.status(404).json({ success: false, message: 'Pengguna dashboard tidak ditemukan' });
    }

    const resolvedClientId = resolveClientId({
      requestedClientId: clientId,
      tokenClientId: req.dashboardUser?.client_id,
      tokenClientIds: req.dashboardUser?.client_ids,
      dashboardUserClientIds: dashboardUser?.client_ids,
    });

    const allowedClientIds = Array.from(
      new Set(
        [
          ...(Array.isArray(req.dashboardUser?.client_ids) ? req.dashboardUser.client_ids : []),
          ...(Array.isArray(dashboardUser?.client_ids) ? dashboardUser.client_ids : []),
        ].filter(Boolean),
      ),
    );

    if (!resolvedClientId) {
      return res.status(400).json({
        success: false,
        message: 'client_id wajib diisi atau akun dashboard harus memiliki satu client aktif',
      });
    }

    if (!isClientAllowed(resolvedClientId, allowedClientIds)) {
      return res.status(403).json({
        success: false,
        message: 'client_id tidak sesuai dengan akses dashboard user',
      });
    }

    const normalizedDashboardUsername = normalizeString(dashboardUser.username);
    const resolvedUsername = submittedUsername || normalizedDashboardUsername;

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
      dashboardUserId,
      userId: dashboardUser.user_id || null,
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
      return res.status(403).json({
        success: false,
        message: 'Akses client dashboard tidak valid untuk membuat permintaan premium',
      });
    }
    next(err);
  }
}
