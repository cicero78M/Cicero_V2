import * as service from '../service/premiumSubscriptionService.js';
import { sendSuccess } from '../utils/response.js';

export async function getAllSubscriptions(req, res, next) {
  try {
    const rows = await service.getSubscriptions();
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

export async function getSubscriptionById(req, res, next) {
  try {
    const row = await service.findSubscriptionById(req.params.id);
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function createSubscription(req, res, next) {
  try {
    const row = await service.createSubscription(req.body);
    sendSuccess(res, row, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateSubscription(req, res, next) {
  try {
    const row = await service.updateSubscription(req.params.id, req.body);
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function deleteSubscription(req, res, next) {
  try {
    const row = await service.deleteSubscription(req.params.id);
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function getActiveSubscription(req, res, next) {
  try {
    const row = await service.findActiveSubscriptionByUser(req.params.user_id);
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}
