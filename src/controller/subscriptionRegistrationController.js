import * as service from '../service/subscriptionRegistrationService.js';
import { sendSuccess } from '../utils/response.js';
import waClient from '../service/waService.js';
import { getAdminWAIds } from '../utils/waHelper.js';

export async function getAllRegistrations(req, res, next) {
  try {
    const rows = await service.getRegistrations();
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

export async function getRegistrationById(req, res, next) {
  try {
    const row = await service.findRegistrationById(req.params.id);
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function createRegistration(req, res, next) {
  try {
    const existing = await service.findPendingByUsername(req.body.user_id);
    if (existing)
      return res
        .status(400)
        .json({ error: 'Masih ada pendaftaran menunggu review' });

    const row = await service.createRegistration(req.body);
    sendSuccess(res, row, 201);

    try {
      const adminIds = getAdminWAIds();
      let msg = '*Permintaan Subscription Premium*\n';
      msg += `ID Permintaan: *${row.registration_id}*\n`;
      msg += `User ID : *${row.username}*\n`;
      if (row.amount) msg += `Nominal : *${row.amount}*\n`;
      msg +=
        `Balas *GRANTSUB#${row.registration_id}* untuk memberi akses atau *DENYSUB#${row.registration_id}* untuk menolak.`;
      for (const admin of adminIds) {
        waClient.sendMessage(admin, msg).catch(() => {});
      }
    } catch (e) {
      console.error('[WA] Failed to notify admin:', e.message);
    }
  } catch (err) {
    next(err);
  }
}

export async function updateRegistration(req, res, next) {
  try {
    const row = await service.updateRegistration(req.params.id, req.body);
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function deleteRegistration(req, res, next) {
  try {
    const row = await service.deleteRegistration(req.params.id);
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}
