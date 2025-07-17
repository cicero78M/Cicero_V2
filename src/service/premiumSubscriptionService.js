import * as model from '../model/premiumSubscriptionModel.js';

export const createSubscription = async data => model.createSubscription(data);

export const getSubscriptions = async () => model.getSubscriptions();

export const findSubscriptionById = async id => model.findSubscriptionById(id);

export const findActiveSubscriptionByUser = async userId =>
  model.findActiveSubscriptionByUser(userId);

export const findLatestSubscriptionByUser = async userId =>
  model.findLatestSubscriptionByUser(userId);

export const updateSubscription = async (id, data) =>
  model.updateSubscription(id, data);

export const deleteSubscription = async id => model.deleteSubscription(id);
