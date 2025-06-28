import * as service from '../service/subscriptionRegistrationService.js';
import { sendSuccess } from '../utils/response.js';

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
    const row = await service.createRegistration(req.body);
    sendSuccess(res, row, 201);
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
