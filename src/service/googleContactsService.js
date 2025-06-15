import { google } from 'googleapis';
import fs from 'fs/promises';

const SCOPES = ['https://www.googleapis.com/auth/contacts'];

async function getOAuth2Client() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || 'credentials.json';
  const tokenPath = process.env.GOOGLE_TOKEN_PATH || 'token.json';
  const content = await fs.readFile(credPath, 'utf8');
  const { client_secret, client_id, redirect_uris } = JSON.parse(content).installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  try {
    const token = await fs.readFile(tokenPath, 'utf8');
    oAuth2Client.setCredentials(JSON.parse(token));
  } catch {
    throw new Error('Token OAuth tidak ditemukan. Jalankan proses OAuth terlebih dahulu.');
  }
  return oAuth2Client;
}

export async function saveNumberToGoogleContacts(number, displayName = '') {
  const auth = await getOAuth2Client();
  const service = google.people({ version: 'v1', auth });
  const search = await service.people.searchContacts({
    query: number,
    readMask: 'names,phoneNumbers',
    pageSize: 10,
  });
  const found = (search.data.results || []).find(r =>
    (r.person.phoneNumbers || []).some(p => p.value.replace(/\D/g, '') === number.replace(/\D/g, ''))
  );
  if (found) {
    return { status: 'exists', resourceName: found.person.resourceName };
  }
  const resp = await service.people.createContact({
    requestBody: {
      names: displayName ? [{ displayName }] : undefined,
      phoneNumbers: [{ value: number }],
    },
  });
  return { status: 'created', resourceName: resp.data.resourceName };
}

export { getOAuth2Client };
