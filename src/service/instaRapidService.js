import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'social-api4.p.rapidapi.com';
const DEBUG_FETCH_IG = process.env.DEBUG_FETCH_INSTAGRAM === 'true';

function logDebug(...args) {
  if (DEBUG_FETCH_IG) console.log('[DEBUG IG]', ...args);
}

export async function fetchInstagramPosts(username, limit = 10) {
  if (!username) return [];

  logDebug('fetchInstagramPosts start', { username, limit });

  const all = [];
  let token = null;

  do {
    logDebug('fetchInstagramPostsPageToken', { token });
    const { items, next_token, has_more } = await fetchInstagramPostsPageToken(username, token);
    logDebug('fetched page', { items: items.length, next_token, has_more });
    // show raw items for debugging
    logDebug('page items', items);
    if (!items.length) break;
    all.push(...items);
    token = next_token;
    logDebug('pagination token updated', { token });
    if (!has_more || !token || (limit && all.length >= limit)) break;
  } while (true);

  logDebug('fetchInstagramPosts done', { total: all.length });

  return limit ? all.slice(0, limit) : all;
}

export async function fetchInstagramProfile(username) {
  if (!username) return null;
  const params = new URLSearchParams({ username_or_id_or_url: username });

  logDebug('fetchInstagramProfile request', params.toString());

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
    logDebug('fetchInstagramProfile error', err.message);
    throw err;
  }
  const data = await res.json();
  logDebug('fetchInstagramProfile success');
  return data?.data || null;
}

export async function fetchInstagramInfo(username) {
  if (!username) return null;
  try {
    logDebug('fetchInstagramInfo request', username);
    const response = await axios.get(`https://${RAPIDAPI_HOST}/v1/info`, {
      params: { username_or_id_or_url: username },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });
    logDebug('fetchInstagramInfo success');
    return response.data?.data || null;
  } catch (err) {
    const msg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    const error = new Error(msg);
    error.statusCode = err.response?.status;
    logDebug('fetchInstagramInfo error', error.message);
    throw error;
  }
}

export async function fetchInstagramPostsPage(username, cursor = null) {
  if (!username) return { items: [], next_cursor: null, has_more: false };
  const params = new URLSearchParams({ username_or_id_or_url: username });
  if (cursor) params.append('pagination_token', cursor);

  logDebug('fetchInstagramPostsPage request', { username, cursor });

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
    logDebug('fetchInstagramPostsPage error', err.message);
    throw err;
  }
  const data = await res.json();
  const items = data?.data?.items || [];
  const next_cursor =
    data?.data?.pagination_token ||
    data?.data?.next_cursor ||
    data?.data?.end_cursor ||
    null;
  const has_more =
    (data?.data?.has_more || false) || (next_cursor && next_cursor !== '');
  logDebug('fetchInstagramPostsPage success', { items: items.length, next_cursor, has_more });
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

  logDebug('fetchInstagramPostsByMonth start', { username, month: monthNum, year: yearNum });

  do {
    logDebug('fetchInstagramPostsPage', { cursor });
    const { items, pagination_token } = await fetchInstagramPostsPage(username, cursor);
    logDebug('fetched page', { items: items.length, pagination_token });
    if (!items.length) break;
    all.push(...items);

    const last = items[items.length - 1];
    const lastDate = new Date((last.taken_at ? last.taken_at * 1000 : last.created_at || 0));
    cursor = pagination_token;
    if (!cursor || lastDate < start) break;
  } while (true);

  logDebug('fetchInstagramPostsByMonth done', { total: all.length });

  return all.filter(p => {
    const d = new Date(p.taken_at ? p.taken_at * 1000 : p.created_at || 0);
    return d >= start && d < end;
  });
}

export async function fetchInstagramPostsPageToken(username, token = null) {
  if (!username) return { items: [], pagination_token: null};
  const params = new URLSearchParams({ username_or_id_or_url: username });
  if (token) params.append('pagination_token', token);

  logDebug('fetchInstagramPostsPageToken request', { token });

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
    logDebug('fetchInstagramPostsPageToken error', err.message);
    throw err;
  }
  const data = await res.json();
  // log raw response data for debugging and to inspect pagination token
  logDebug('fetchInstagramPostsPageToken raw', data);
  const items = data?.data?.items || [];
  const next_token =
    data?.pagination_token ||
    null;
  logDebug('fetchInstagramPostsPageToken success', { items: items.length, next_token });
  return { items, next_token };
}

export async function fetchInstagramPostsByMonthToken(username, month, year) {
  if (!username) return [];
  const now = new Date();
  const m = parseInt(month);
  const y = parseInt(year);
  const monthNum = Number.isNaN(m) ? now.getMonth() + 1 : m;
  const yearNum = Number.isNaN(y) ? now.getFullYear() : y;
  const start = new Date(yearNum, monthNum - 1, 1);
  const end = new Date(yearNum, monthNum, 1);

  let token = null;
  const all = [];

  logDebug('fetchInstagramPostsByMonthToken start', { username, month: monthNum, year: yearNum });

  do {
    logDebug('fetchInstagramPostsPageToken', { token });
    const { items, pagination_token } = await fetchInstagramPostsPageToken(username, token);
    logDebug('fetched page', { items: items.length, pagination_token });
    // show raw items for debugging
    logDebug('page items', items);
    if (!items.length) break;
    all.push(...items);

    const last = items[items.length - 1];
    const lastDate = new Date((last.taken_at ? last.taken_at * 1000 : last.created_at || 0));
    token = pagination_token;
    logDebug('pagination token updated', { token });
    // Stop early when the last item falls before the requested month
    // because results are returned in descending order. Once a date is
    // older than the start of the month, no further pages will contain
    // newer posts from that month.
    if (!token || lastDate < start) break;

    // add delay between pagination requests
    await new Promise(resolve => setTimeout(resolve, 1500));
  } while (true);

  logDebug('fetchInstagramPostsByMonthToken done', { total: all.length });

  return all.filter(p => {
    const d = new Date(p.taken_at ? p.taken_at * 1000 : p.created_at || 0);
    return d >= start && d < end;
  });
}

