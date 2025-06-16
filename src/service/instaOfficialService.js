const BASE_URL = 'https://graph.instagram.com';

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    const err = new Error(`Instagram API error: ${msg}`);
    err.statusCode = data?.error?.code || res.status;
    throw err;
  }
  return data;
}

export async function fetchBasicProfile(accessToken) {
  if (!accessToken) return null;
  const fields = 'id,username,account_type,media_count';
  const url = `${BASE_URL}/me?fields=${fields}&access_token=${accessToken}`;
  const data = await fetchJson(url);
  return data;
}

export async function fetchBasicPosts(accessToken, limit = 10) {
  if (!accessToken) return [];
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
  const url = `${BASE_URL}/me/media?fields=${fields}&access_token=${accessToken}&limit=${limit}`;
  const data = await fetchJson(url);
  return Array.isArray(data?.data) ? data.data : [];
}

