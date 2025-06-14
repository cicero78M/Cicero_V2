import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'social-api4.p.rapidapi.com';

export async function fetchInstagramPosts(username, limit = 10) {
  if (!username) return [];
  const params = new URLSearchParams({ username_or_id_or_url: username });

  const res = await fetch(`https://${RAPIDAPI_HOST}/v1/posts?${params.toString()}`, {
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
      'x-cache-control': 'no-cache'
    }
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text);
    err.statusCode = res.status;
    throw err;
  }
  const data = await res.json();
  const items = data?.data?.items || [];
  return limit ? items.slice(0, limit) : items;
}

export async function fetchInstagramProfile(username) {
  if (!username) return null;
  const params = new URLSearchParams({ username_or_id_or_url: username });

  const res = await fetch(`https://${RAPIDAPI_HOST}/v1/info?${params.toString()}`, {
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
      'x-cache-control': 'no-cache'
    }
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text);
    err.statusCode = res.status;
    throw err;
  }
  const data = await res.json();
  return data?.data || null;
}

export async function fetchInstagramInfo(username) {
  if (!username) return null;
  try {
    const response = await axios.get(`https://${RAPIDAPI_HOST}/v1/info`, {
      params: { username_or_id_or_url: username },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });
    return response.data?.data || null;
  } catch (err) {
    const msg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    const error = new Error(msg);
    error.statusCode = err.response?.status;
    throw error;
  }
}

export async function fetchInstagramPostsPage(username, cursor = null) {
  if (!username) return { items: [], next_cursor: null, has_more: false };
  const params = new URLSearchParams({ username_or_id_or_url: username });
  if (cursor) params.append('cursor', cursor);

  const res = await fetch(`https://${RAPIDAPI_HOST}/v1/posts?${params.toString()}`, {
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
      'x-cache-control': 'no-cache'
    }
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text);
    err.statusCode = res.status;
    throw err;
  }
  const data = await res.json();
  const items = data?.data?.items || [];
  const next_cursor = data?.data?.next_cursor || data?.data?.end_cursor || null;
  const has_more = data?.data?.has_more || (next_cursor && next_cursor !== '');
  return { items, next_cursor, has_more };
}

export async function fetchInstagramPostsByMonth(username, month, year) {
  if (!username) return [];
  const now = new Date();
  const m = parseInt(month);
  const y = parseInt(year);
  const monthNum = Number.isNaN(m) ? now.getMonth() + 1 : m;
  const yearNum = Number.isNaN(y) ? now.getFullYear() : y;
  const start = new Date(yearNum, monthNum - 1, 1);
  const end = new Date(yearNum, monthNum, 1);

  let cursor = null;
  const all = [];
  let page = 0;
  const MAX_PAGE = 20;

  do {
    const { items, next_cursor, has_more } = await fetchInstagramPostsPage(username, cursor);
    if (!items.length) break;
    all.push(...items);

    const last = items[items.length - 1];
    const lastDate = new Date((last.taken_at ? last.taken_at * 1000 : last.created_at || 0));
    cursor = next_cursor;
    page += 1;
    if (!has_more || !cursor || lastDate < start || page >= MAX_PAGE) break;
  } while (true);

  return all.filter(p => {
    const d = new Date(p.taken_at ? p.taken_at * 1000 : p.created_at || 0);
    return d >= start && d < end;
  });
}

