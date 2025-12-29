import * as dashboardUserModel from '../model/dashboardUserModel.js';
import { createPremiumAccessRequest } from '../service/dashboardPremiumRequestService.js';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : value;
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

    const userId =
      normalizeString(req.body.user_id || req.body.userId) ||
      dashboardUser.user_id ||
      dashboardUser.dashboard_user_id ||
      null;

    const { request, notification } = await createPremiumAccessRequest({
      dashboardUser,
      bankName,
      accountNumber,
      senderName,
      transferAmount,
      premiumTier,
      clientId,
      userId,
      submittedUsername,
      rawAmountField: transferAmountRaw,
    });

    return res.status(201).json({
      success: true,
      data: {
        request,
        notification,
      },
    });
  } catch (err) {
    next(err);
  }
}
