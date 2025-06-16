import { env } from '../config/env.js';

const GRAPH_URL = 'https://graph.facebook.com/v18.0';

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    const err = new Error(`Instagram API error: ${msg}`);
    err.statusCode = data?.error?.code || res.status;
    throw err;
  }
  return data;
}

export async function deleteInstagramCallback() {
  const appToken = `${env.INSTAGRAM_APP_ID}|${env.INSTAGRAM_APP_SECRET}`;
  const url = `${GRAPH_URL}/${env.INSTAGRAM_APP_ID}/subscriptions?access_token=${appToken}`;
  return await fetchJson(url, { method: 'DELETE' });
}
