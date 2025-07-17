import waClient from '../service/waService.js';
import { getAdminWAIds } from '../utils/waHelper.js';
import { sendSuccess } from '../utils/response.js';

export async function sendConfirmation(req, res, next) {
  try {
    const { user_id: userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'user_id required' });
    }
    const msg = `*Konfirmasi Pembayaran Premium*\nUser ID: *${userId}*`;
    for (const admin of getAdminWAIds()) {
      waClient.sendMessage(admin, msg).catch(() => {});
    }
    sendSuccess(res, { ok: true }, 201);
  } catch (err) {
    next(err);
  }
}
