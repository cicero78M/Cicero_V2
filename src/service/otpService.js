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
  const wa = normalizeWhatsappNumber(whatsapp);
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + OTP_TTL_MS;
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
  verifiedStore.set(nrp, { whatsapp: wa, expires: Date.now() + VERIFY_TTL_MS });
  return true;
}

export function isVerified(nrp, whatsapp) {
  const wa = normalizeWhatsappNumber(whatsapp);
  const record = verifiedStore.get(nrp);
  if (!record) return false;
  if (record.whatsapp !== wa) return false;
  if (record.expires < Date.now()) {
    verifiedStore.delete(nrp);
    return false;
  }
  return true;
}

export function clearVerification(nrp) {
  verifiedStore.delete(nrp);
}
