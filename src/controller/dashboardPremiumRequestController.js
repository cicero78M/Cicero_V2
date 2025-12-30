import {
  confirmDashboardPremiumRequest,
  createDashboardPremiumRequest,
  findDashboardPremiumRequestByToken,
} from '../service/dashboardPremiumRequestService.js';
import waClient from '../service/waService.js';
import { sendDashboardPremiumRequestNotification } from '../service/waService.js';

function getDashboardUserFromRequest(req) {
  return req.dashboardUser || req.user || null;
}

export async function createDashboardPremiumRequestController(req, res, next) {
  try {
    const dashboardUser = getDashboardUserFromRequest(req);
    const request = await createDashboardPremiumRequest(dashboardUser, req.body || {});
    res.status(201).json({ success: true, request });
  } catch (err) {
    next(err);
  }
}

export async function confirmDashboardPremiumRequestController(req, res, next) {
  try {
    const dashboardUser = getDashboardUserFromRequest(req);
    const { token } = req.params;
    const request = await confirmDashboardPremiumRequest(token, dashboardUser, req.body || {});
    await sendDashboardPremiumRequestNotification(waClient, request);
    res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
}

export async function getDashboardPremiumRequestController(req, res, next) {
  try {
    const dashboardUser = getDashboardUserFromRequest(req);
    const { token } = req.params;
    const request = await findDashboardPremiumRequestByToken(token);
    if (!request || request.dashboard_user_id !== dashboardUser?.dashboard_user_id) {
      return res.status(404).json({ success: false, message: 'Request tidak ditemukan' });
    }
    res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
}
