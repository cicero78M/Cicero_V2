import { publishToQueue, consumeQueue } from './rabbitMQService.js';
import waClient, { waitForWaReady } from './waService.js';
import { formatToWhatsAppId, safeSendMessage } from '../utils/waHelper.js';

const OTP_QUEUE = 'otp_queue';

export function enqueueOtp(wa, otp) {
  return publishToQueue(OTP_QUEUE, { wa, otp });
}

export async function startOtpWorker() {
  await consumeQueue(OTP_QUEUE, async ({ wa, otp }) => {
    try {
      await waitForWaReady();
      const wid = formatToWhatsAppId(wa);
      await safeSendMessage(waClient, wid, `Kode OTP Anda: ${otp}`);
    } catch (err) {
      console.warn(`[WA] Failed to send OTP to ${wa}: ${err.message}`);
    }
  });
}
