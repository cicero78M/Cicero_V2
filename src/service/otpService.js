import redis from '../config/redis.js';
import { normalizeWhatsappNumber } from '../utils/waHelper.js';

const OTP_TTL_SEC = 5 * 60;
const VERIFY_TTL_SEC = 10 * 60;

export async function generateOtp(nrp, whatsapp) {
  const key = String(nrp);
  const wa = normalizeWhatsappNumber(whatsapp);
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const value = JSON.stringify({ otp, whatsapp: wa });
  await redis.set(`otp:${key}`, value, { EX: OTP_TTL_SEC });
  return otp;
}

export async function verifyOtp(nrp, whatsapp, code) {
  const key = String(nrp);
  const wa = normalizeWhatsappNumber(whatsapp);
  const data = await redis.get(`otp:${key}`);
  if (!data) return false;
  const { otp, whatsapp: storedWa } = JSON.parse(data);
  if (storedWa !== wa || otp !== code) return false;
  await redis.del(`otp:${key}`);
  await redis.set(`verified:${key}`, wa, { EX: VERIFY_TTL_SEC });
  return true;
}

export async function isVerified(nrp, whatsapp) {
  const key = String(nrp);
  const wa = normalizeWhatsappNumber(whatsapp);
  const storedWa = await redis.get(`verified:${key}`);
  if (!storedWa) return false;
  if (storedWa !== wa) return false;
  return true;
}

export async function clearVerification(nrp) {
  await redis.del(`verified:${String(nrp)}`);
}
