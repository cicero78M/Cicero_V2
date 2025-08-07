import fs from 'fs';
import { google } from 'googleapis';
import { query } from '../db/index.js';
import { env } from '../config/env.js';

/**
 * Save WhatsApp contact to Google People API if it has not been saved before.
 * @param {string} chatId - WhatsApp chat ID (e.g., '12345@c.us').
 */
export async function saveContactIfNew(chatId) {
  const phone = (chatId || '').replace(/[^0-9]/g, '');
  if (!phone) return;

  try {
    const check = await query(
      'SELECT phone_number FROM saved_contact WHERE phone_number = $1',
      [phone]
    );
    if (check.rowCount > 0) return;

    if (!env.GOOGLE_SERVICE_ACCOUNT) {
      console.warn('[GOOGLE] Service account not configured');
      return;
    }

    if (!env.GOOGLE_IMPERSONATE_EMAIL) {
      console.warn('[GOOGLE] Impersonation email not configured');
      return;
    }

    let credentials;
    const isPath =
      env.GOOGLE_SERVICE_ACCOUNT.startsWith('/') ||
      env.GOOGLE_SERVICE_ACCOUNT.endsWith('.json');
    try {
      if (isPath) {
        const file = fs.readFileSync(env.GOOGLE_SERVICE_ACCOUNT, 'utf8');
        credentials = JSON.parse(file);
      } else {
        credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
      }
    } catch (err) {
      const expected = isPath ? 'path to JSON file' : 'JSON string';
      console.error(
        `[GOOGLE CONTACT] Failed to parse service account ${expected}:`,
        err.message
      );
      return;
    }

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [env.GOOGLE_CONTACT_SCOPE],
      subject: env.GOOGLE_IMPERSONATE_EMAIL
    });

    const service = google.people({ version: 'v1', auth });

    const res = await service.people.createContact({
      requestBody: {
        phoneNumbers: [{ value: `+${phone}` }]
      }
    });

    const resourceName = res.data.resourceName || null;
    await query(
      'INSERT INTO saved_contact (phone_number, resource_name) VALUES ($1, $2)',
      [phone, resourceName]
    );
  } catch (err) {
    const status = err?.response?.status || err.code;
    console.error(
      '[GOOGLE CONTACT] Failed to save contact:',
      err.message,
      status ? `(status ${status})` : ''
    );
  }
}
