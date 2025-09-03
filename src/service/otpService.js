import crypto from 'crypto';
import redis from '../config/redis.js';
import { normalizeWhatsappNumber } from '../utils/waHelper.js';
import { normalizeUserId } from '../utils/utilsHelper.js';

const OTP_TTL_SEC = 5 * 60;
const VERIFY_TTL_SEC = 10 * 60;
const MAX_ATTEMPTS = 3;

function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

export async function generateOtp(nrp, whatsapp) {
  const key = normalizeUserId(nrp);
  const wa = normalizeWhatsappNumber(whatsapp);
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const value = JSON.stringify({ hash: hashOtp(otp), whatsapp: wa, attempts: 0 });
  await redis.set(`otp:${key}`, value, { EX: OTP_TTL_SEC });
  return otp;
}

export async function verifyOtp(nrp, whatsapp, code) {
  const key = normalizeUserId(nrp);
  const wa = normalizeWhatsappNumber(whatsapp);
  const data = await redis.get(`otp:${key}`);
  if (!data) return false;
  const { hash, whatsapp: storedWa, attempts = 0 } = JSON.parse(data);
  if (storedWa !== wa) return false;
  if (attempts >= MAX_ATTEMPTS) {
    await redis.del(`otp:${key}`);
    return false;
  }
  if (hash !== hashOtp(code)) {
    const ttl = await redis.ttl(`otp:${key}`);
    const updated = JSON.stringify({ hash, whatsapp: storedWa, attempts: attempts + 1 });
    await redis.set(`otp:${key}`, updated, { EX: ttl });
    return false;
  }
  await redis.del(`otp:${key}`);
  await redis.set(`verified:${key}`, wa, { EX: VERIFY_TTL_SEC });
  return true;
}

export async function isVerified(nrp, whatsapp) {
  const key = normalizeUserId(nrp);
  const wa = normalizeWhatsappNumber(whatsapp);
  const storedWa = await redis.get(`verified:${key}`);
  if (!storedWa) return false;
  if (storedWa !== wa) return false;
  return true;
}

export async function clearVerification(nrp) {
  const key = normalizeUserId(nrp);
  await redis.del(`verified:${key}`);
}
