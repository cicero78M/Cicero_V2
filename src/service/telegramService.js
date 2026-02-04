import TelegramBot from 'node-telegram-bot-api';
import * as dashboardUserModel from '../model/dashboardUserModel.js';
import { formatToWhatsAppId, safeSendMessage } from '../utils/waHelper.js';
import waClient, { waitForWaReady } from './waService.js';

let bot = null;
let isInitialized = false;
let initError = null;

/**
 * Initialize Telegram bot
 */
export function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!token || !adminChatId) {
    console.log(
      '[TELEGRAM] Telegram bot is disabled. Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID to enable.'
    );
    return false;
  }

  try {
    bot = new TelegramBot(token, { polling: true });
    isInitialized = true;

    // Handle /start command
    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      bot.sendMessage(
        chatId,
        '👋 Selamat datang di Cicero Bot!\n\nBot ini digunakan untuk approval dashboard user.\n\nGunakan perintah berikut:\n/approve <username> - Setujui registrasi user\n/deny <username> - Tolak registrasi user'
      );
    });

    // Handle /approve command
    bot.onText(/\/approve (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const username = match[1]?.trim();

      // Check if admin
      if (String(chatId) !== adminChatId) {
        bot.sendMessage(chatId, '❌ Anda tidak memiliki akses untuk perintah ini.');
        return;
      }

      if (!username) {
        bot.sendMessage(chatId, '❌ Format salah! Gunakan: /approve <username>');
        return;
      }

      try {
        const usr = await dashboardUserModel.findByUsername(username);
        if (!usr) {
          bot.sendMessage(chatId, `❌ Username ${username} tidak ditemukan.`);
          return;
        }

        await dashboardUserModel.updateStatus(usr.dashboard_user_id, true);
        bot.sendMessage(chatId, `✅ User ${usr.username} telah disetujui.`);

        // Send notification to user via WhatsApp
        if (usr.whatsapp) {
          try {
            await waitForWaReady();
            const wid = formatToWhatsAppId(usr.whatsapp);
            await safeSendMessage(
              waClient,
              wid,
              `✅ Registrasi dashboard Anda telah disetujui.\nUsername: ${usr.username}`
            );
          } catch (err) {
            console.warn(
              `[TELEGRAM] Gagal mengirim notifikasi WA untuk ${usr.username}: ${err.message}`
            );
          }
        }
      } catch (err) {
        console.error('[TELEGRAM] Error saat approve user:', err);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${err.message}`);
      }
    });

    // Handle /deny command
    bot.onText(/\/deny (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const username = match[1]?.trim();

      // Check if admin
      if (String(chatId) !== adminChatId) {
        bot.sendMessage(chatId, '❌ Anda tidak memiliki akses untuk perintah ini.');
        return;
      }

      if (!username) {
        bot.sendMessage(chatId, '❌ Format salah! Gunakan: /deny <username>');
        return;
      }

      try {
        const usr = await dashboardUserModel.findByUsername(username);
        if (!usr) {
          bot.sendMessage(chatId, `❌ Username ${username} tidak ditemukan.`);
          return;
        }

        await dashboardUserModel.updateStatus(usr.dashboard_user_id, false);
        bot.sendMessage(chatId, `❌ User ${usr.username} telah ditolak.`);

        // Send notification to user via WhatsApp
        if (usr.whatsapp) {
          try {
            await waitForWaReady();
            const wid = formatToWhatsAppId(usr.whatsapp);
            await safeSendMessage(
              waClient,
              wid,
              `❌ Registrasi dashboard Anda ditolak.\nUsername: ${usr.username}`
            );
          } catch (err) {
            console.warn(
              `[TELEGRAM] Gagal mengirim notifikasi WA untuk ${usr.username}: ${err.message}`
            );
          }
        }
      } catch (err) {
        console.error('[TELEGRAM] Error saat deny user:', err);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${err.message}`);
      }
    });

    // Error handling
    bot.on('polling_error', (error) => {
      console.error('[TELEGRAM] Polling error:', error.message);
      initError = error;
    });

    console.log('[TELEGRAM] Telegram bot initialized successfully');
    return true;
  } catch (err) {
    console.error('[TELEGRAM] Failed to initialize Telegram bot:', err);
    initError = err;
    isInitialized = false;
    return false;
  }
}

/**
 * Send approval request notification to Telegram admin
 * @param {Object} data - User data
 * @param {string} data.username - Username
 * @param {string} data.dashboard_user_id - User ID
 * @param {string} data.role - User role
 * @param {string} data.whatsapp - WhatsApp number
 * @param {Array<string>} data.clientIds - Client IDs
 */
export async function sendTelegramApprovalRequest(data) {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!bot || !isInitialized || !adminChatId) {
    console.warn('[TELEGRAM] Bot not initialized or admin chat ID not configured');
    return false;
  }

  try {
    const message = `📋 Permintaan User Approval

Username: ${data.username}
ID: ${data.dashboard_user_id}
Role: ${data.role || '-'}
WhatsApp: ${data.whatsapp}
Client ID: ${data.clientIds?.length ? data.clientIds.join(', ') : '-'}

Gunakan perintah berikut untuk menyetujui atau menolak:
/approve ${data.username}
/deny ${data.username}`;

    await bot.sendMessage(adminChatId, message);
    console.log(`[TELEGRAM] Approval request sent for ${data.username}`);
    return true;
  } catch (err) {
    console.error('[TELEGRAM] Failed to send approval request:', err);
    return false;
  }
}

/**
 * Send generic notification to Telegram admin
 * @param {string} message - Message to send
 */
export async function sendTelegramNotification(message) {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!bot || !isInitialized || !adminChatId) {
    return false;
  }

  try {
    await bot.sendMessage(adminChatId, message);
    return true;
  } catch (err) {
    console.error('[TELEGRAM] Failed to send notification:', err);
    return false;
  }
}

/**
 * Check if Telegram bot is enabled and initialized
 */
export function isTelegramEnabled() {
  return isInitialized && bot !== null;
}

/**
 * Get bot instance (for testing purposes)
 */
export function getTelegramBot() {
  return bot;
}

/**
 * Stop the Telegram bot
 */
export function stopTelegramBot() {
  if (bot && isInitialized) {
    bot.stopPolling();
    bot = null;
    isInitialized = false;
    console.log('[TELEGRAM] Telegram bot stopped');
  }
}

export default {
  initTelegramBot,
  sendTelegramApprovalRequest,
  sendTelegramNotification,
  isTelegramEnabled,
  getTelegramBot,
  stopTelegramBot
};
