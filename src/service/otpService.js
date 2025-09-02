import { normalizeWhatsappNumber } from '../utils/waHelper.js';

const otpStore = new Map();
const verifiedStore = new Map();

export function generateOtp(nrp, whatsapp) {
  const wa = normalizeWhatsappNumber(whatsapp);
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + 5 * 60 * 1000; // 5 minutes
  otpStore.set(nrp, { otp, whatsapp: wa, expires });
  return otp;
}

export function verifyOtp(nrp, whatsapp, code) {
  const wa = normalizeWhatsappNumber(whatsapp);
  const record = otpStore.get(nrp);
  if (!record) return false;
  if (record.whatsapp !== wa) return false;
  if (record.expires < Date.now()) {
    otpStore.delete(nrp);
    return false;
  }
  if (record.otp !== code) return false;
  otpStore.delete(nrp);
  verifiedStore.set(nrp, wa);
  return true;
}

export function isVerified(nrp, whatsapp) {
  const wa = normalizeWhatsappNumber(whatsapp);
  return verifiedStore.get(nrp) === wa;
}

export function clearVerification(nrp) {
  verifiedStore.delete(nrp);
}
