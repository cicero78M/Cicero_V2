import { normalizeWhatsappNumber } from '../utils/waHelper.js';

const OTP_TTL_MS = 5 * 60 * 1000;
const VERIFY_TTL_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

const otpStore = new Map();
const verifiedStore = new Map();

function cleanupStores() {
  const now = Date.now();
  for (const [nrp, { expires }] of otpStore) {
    if (expires < now) otpStore.delete(nrp);
  }
  for (const [nrp, record] of verifiedStore) {
    if (record.expires < now) verifiedStore.delete(nrp);
  }
}

setInterval(cleanupStores, CLEANUP_INTERVAL_MS).unref();

export function generateOtp(nrp, whatsapp) {
  const key = String(nrp);
  const wa = normalizeWhatsappNumber(whatsapp);
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + OTP_TTL_MS;
  otpStore.set(key, { otp, whatsapp: wa, expires });
  return otp;
}

export function verifyOtp(nrp, whatsapp, code) {
  const key = String(nrp);
  const wa = normalizeWhatsappNumber(whatsapp);
  const record = otpStore.get(key);
  if (!record) return false;
  if (record.whatsapp !== wa) return false;
  if (record.expires < Date.now()) {
    otpStore.delete(key);
    return false;
  }
  if (record.otp !== code) return false;
  otpStore.delete(key);
  verifiedStore.set(key, { whatsapp: wa, expires: Date.now() + VERIFY_TTL_MS });
  return true;
}

export function isVerified(nrp, whatsapp) {
  const key = String(nrp);
  const wa = normalizeWhatsappNumber(whatsapp);
  const record = verifiedStore.get(key);
  if (!record) return false;
  if (record.whatsapp !== wa) return false;
  if (record.expires < Date.now()) {
    verifiedStore.delete(key);
    return false;
  }
  return true;
}

export function clearVerification(nrp) {
  verifiedStore.delete(String(nrp));
}
