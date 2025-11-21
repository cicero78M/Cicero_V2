import { scheduleCronJob } from "../utils/cronScheduler.js";
import { waGatewayClient } from "../service/waService.js";
import { safeSendMessage, formatToWhatsAppId } from "../utils/waHelper.js";
import { getActiveUsersWithWhatsapp } from "../model/userModel.js";

export const JOB_KEY = "./src/cron/cronWaNotificationReminder.js";

function buildNotificationMessage() {
  return (
    "👋 Pengingat engagement harian\n\n" +
    "1️⃣ Pastikan setiap unggahan mendapat dukungan likes sesuai target.\n" +
    "2️⃣ Tambahkan komentar positif dan relevan pada konten terbaru.\n\n" +
    "Balas *notifwa#off* jika ingin berhenti menerima pengingat otomatis."
  );
}

function normalizeRecipient(whatsapp) {
  const digits = String(whatsapp ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return formatToWhatsAppId(digits);
}

export async function runCron() {
  const users = await getActiveUsersWithWhatsapp();
  const message = buildNotificationMessage();
  const recipients = new Set();

  for (const user of users) {
    if (user?.wa_notification_opt_in !== true) continue;
    const chatId = normalizeRecipient(user?.whatsapp);
    if (!chatId) continue;
    recipients.add(chatId);
  }

  for (const chatId of recipients) {
    await safeSendMessage(waGatewayClient, chatId, message);
  }
}

if (process.env.JEST_WORKER_ID === undefined) {
  scheduleCronJob(JOB_KEY, "5 19 * * *", () => runCron(), { timezone: "Asia/Jakarta" });
}

export default null;
