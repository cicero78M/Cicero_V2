import { findByUserId, updatePremiumStatus } from '../model/instagramUserModel.js';

export async function getPremiumInfo(userId) {
  return findByUserId(userId);
}

export async function grantPremium(userId, endDate = null) {
  return updatePremiumStatus(userId, true, endDate);
}

export async function revokePremium(userId) {
  return updatePremiumStatus(userId, false, null);
}
