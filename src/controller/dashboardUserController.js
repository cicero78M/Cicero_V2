import * as dashboardUserModel from '../model/dashboardUserModel.js';
import { formatToWhatsAppId, safeSendMessage } from '../utils/waHelper.js';
import waClient, { waReady } from '../service/waService.js';
import { sendSuccess } from '../utils/response.js';

export async function approveDashboardUser(req, res, next) {
  try {
    if (req.dashboardUser.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    const usr = await dashboardUserModel.findById(id);
    if (!usr) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const updated = await dashboardUserModel.updateStatus(id, true);
    if (waReady && usr.whatsapp) {
      const wid = formatToWhatsAppId(usr.whatsapp);
      await safeSendMessage(
        waClient,
        wid,
        `✅ Registrasi dashboard Anda telah disetujui.\nUsername: ${usr.username}`
      );
    }
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}
