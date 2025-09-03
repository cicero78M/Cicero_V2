import waClient, { waitForWaReady } from './waService.js';
import { formatToWhatsAppId, safeSendMessage } from '../utils/waHelper.js';

/**
 * Send an OTP message directly via WhatsApp. The previous implementation
 * used a RabbitMQ queue which introduced noticeable delay. By sending the
 * message synchronously, the OTP reaches the user immediately.
 */
export async function enqueueOtp(wa, otp) {
  try {
    await waitForWaReady();
    const wid = formatToWhatsAppId(wa);
    await safeSendMessage(waClient, wid, `Kode OTP Anda: ${otp}`);
  } catch (err) {
    console.warn(`[WA] Failed to send OTP to ${wa}: ${err.message}`);
    throw err;
  }
}

// Kept for backward compatibility; no longer needed when sending OTP directly.
export async function startOtpWorker() {
  return Promise.resolve();
}
