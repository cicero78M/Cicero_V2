import fs from 'fs/promises';
import path from 'path';
import { google } from 'googleapis';
import { query } from '../db/index.js';

const SCOPES = ['https://www.googleapis.com/auth/contacts'];
const TOKEN_PATH = path.resolve('token.json');
const CREDENTIALS_PATH = path.resolve('credentials.json');

export async function authorize() {
  let credentials;
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    credentials = JSON.parse(content);
  } catch {
    throw new Error('Missing credentials.json');
  }
  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );
  try {
    const token = await fs.readFile(TOKEN_PATH, 'utf8');
    oAuth2Client.setCredentials(JSON.parse(token));
  } catch {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    throw new Error('Missing token.json');
  }
  return oAuth2Client;
}

export async function searchByNumbers(auth, numbers = []) {
  if (!numbers.length) return [];
  const service = google.people({ version: 'v1', auth });
  const found = [];
  for (const num of numbers) {
    try {
      const res = await service.people.searchContacts({
        query: num,
        readMask: 'names,phoneNumbers',
        pageSize: 1,
      });
      if (res.data.results && res.data.results.length) {
        found.push(num);
      }
    } catch (err) {
      console.error('[GOOGLE CONTACT] search failed:', err.message);
    }
  }
  return found;
}

export async function saveGoogleContact(auth, { name, phone }) {
  const service = google.people({ version: 'v1', auth });
  await service.people.createContact({
    requestBody: {
      names: [{ givenName: name }],
      phoneNumbers: [{ value: `+${phone}` }],
    },
  });
}

export async function saveContactIfNew(chatId) {
  const phone = (chatId || '').replace(/[^0-9]/g, '');
  if (!phone) return;
  try {
    const check = await query(
      'SELECT phone_number FROM saved_contact WHERE phone_number = $1',
      [phone]
    );
    if (check.rowCount > 0) return;
    const auth = await authorize();
    const exists = await searchByNumbers(auth, [phone]);
    if (exists.includes(phone)) {
      await query(
        'INSERT INTO saved_contact (phone_number) VALUES ($1) ON CONFLICT DO NOTHING',
        [phone]
      );
      return;
    }
    await saveGoogleContact(auth, { name: phone, phone });
    await query(
      'INSERT INTO saved_contact (phone_number) VALUES ($1)',
      [phone]
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
