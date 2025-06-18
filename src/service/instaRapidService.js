import axios from 'axios';
import fetch from 'node-fetch';
import { env } from '../config/env.js';

const RAPIDAPI_KEY = env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'social-api4.p.rapidapi.com';
const DEBUG_FETCH_IG = env.DEBUG_FETCH_INSTAGRAM;

function sendConsoleDebug(...args) {
  if (DEBUG_FETCH_IG) console.log('[DEBUG IG]', ...args);
}

export async function fetchInstagramPosts(username, limit = 10) {
  if (!username) return [];

  sendConsoleDebug('fetchInstagramPosts start', { username, limit });

  const all = [];
  let token = null;

  do {
    sendConsoleDebug('fetchInstagramPostsPageToken', { token });
    const { items, next_token, has_more } = await fetchInstagramPostsPageToken(username, token);
    sendConsoleDebug('fetched page', { items: items.length, next_token, has_more });
    if (!items.length) break;
    all.push(...items);
    token = next_token;
    sendConsoleDebug('pagination token updated', { token });
    if (!has_more || !token || (limit && all.length >= limit)) break;
  } while (true);

  sendConsoleDebug('fetchInstagramPosts done', { total: all.length });

  return limit ? all.slice(0, limit) : all;
}

export async function fetchInstagramProfile(username) {
  if (!username) return null;
  const params = new URLSearchParams({ username_or_id_or_url: username });

  sendConsoleDebug('fetchInstagramProfile request', params.toString());

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
    sendConsoleDebug('fetchInstagramProfile error', err.message);
    throw err;
  }
  const data = await res.json();
  sendConsoleDebug('fetchInstagramProfile success');
  return data?.data || null;
}

export async function fetchInstagramInfo(username) {
  if (!username) return null;
  try {
    sendConsoleDebug('fetchInstagramInfo request', username);
    const response = await axios.get(`https://${RAPIDAPI_HOST}/v1/info`, {
      params: { username_or_id_or_url: username },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });
    sendConsoleDebug('fetchInstagramInfo success');
    return response.data?.data || null;
  } catch (err) {
    const msg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    const error = new Error(msg);
    error.statusCode = err.response?.status;
    sendConsoleDebug('fetchInstagramInfo error', error.message);
    throw error;
  }
}

export async function fetchInstagramPostsPage(username, cursor = null) {
  if (!username) return { items: [], next_cursor: null, has_more: false };
  const params = new URLSearchParams({ username_or_id_or_url: username });
  if (cursor) params.append('pagination_token', cursor);

  sendConsoleDebug('fetchInstagramPostsPage request', { username, cursor });

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
    sendConsoleDebug('fetchInstagramPostsPage error', err.message);
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
  sendConsoleDebug('fetchInstagramPostsPage success', { items: items.length, next_cursor, has_more });
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

  sendConsoleDebug('fetchInstagramPostsByMonth start', { username, month: monthNum, year: yearNum });

  do {
    sendConsoleDebug('fetchInstagramPostsPage', { cursor });

    const { items, pagination_token } = await fetchInstagramPostsPage(username, cursor);
    sendConsoleDebug('fetched page', { items: items.length, pagination_token });
    if (!items.length) break;
    all.push(...items);

    const last = items[items.length - 1];
    const lastDate = new Date((last.taken_at ? last.taken_at * 1000 : last.created_at || 0));
    cursor = pagination_token;
    if (!cursor || lastDate < start) break;
  } while (true);

  sendConsoleDebug('fetchInstagramPostsByMonth done', { total: all.length });

  return all.filter(p => {
    const d = new Date(p.taken_at ? p.taken_at * 1000 : p.created_at || 0);
    return d >= start && d < end;
  });
}

export async function fetchInstagramPostsPageToken(username, token = null) {
  if (!username) return { items: [], next_token: null, has_more: false};
  const params = new URLSearchParams({ username_or_id_or_url: username });
  if (token) params.append('pagination_token', token);

  sendConsoleDebug('fetchInstagramPostsPageToken request', { token });

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
    sendConsoleDebug('fetchInstagramPostsPageToken error', err.message);
    throw err;
  }
  const data = await res.json();
  const items = data?.data?.items || [];
  sendConsoleDebug('fetchInstagramPostsPageToken received', { items: items.length });
  const next_token = data?.pagination_token || null;
  const has_more = (data?.has_more || false) || (next_token && next_token !== '');
  sendConsoleDebug('fetchInstagramPostsPageToken success', { items: items.length, next_token, has_more });
  return { items, next_token, has_more };
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

  sendConsoleDebug('fetchInstagramPostsByMonthToken start', { username, month: monthNum, year: yearNum });

  do {

    sendConsoleDebug('fetchInstagramPostsPageToken', { token });
    const { items, next_token } = await fetchInstagramPostsPageToken(username, token);
    sendConsoleDebug('fetched page', { items: items.length, next_token });
    sendConsoleDebug('page item count', { count: items.length });
    if (!items.length) break;
    all.push(...items);

    const last = items[items.length - 1];
    const lastDate = new Date((last.taken_at ? last.taken_at * 1000 : last.created_at || 0));
    token = next_token;
    sendConsoleDebug('pagination token updated', { token });
    // Stop early when the last item falls before the requested month
    // because results are returned in descending order. Once a date is
    // older than the start of the month, no further pages will contain
    // newer posts from that month.
    if (!token || lastDate < start) break;

    // add delay between pagination requests
    await new Promise(resolve => setTimeout(resolve, 1500));
  } while (true);

  sendConsoleDebug('fetchInstagramPostsByMonthToken done', { total: all.length });

  return all.filter(p => {
    const d = new Date(p.taken_at ? p.taken_at * 1000 : p.created_at || 0);
    return d >= start && d < end;
  });
}

export async function fetchInstagramLikesPage(shortcode, cursor = null) {
  if (!shortcode) return { usernames: [], next_cursor: null, has_more: false };
  const params = new URLSearchParams({ code_or_id_or_url: shortcode });
  if (cursor) params.append('cursor', cursor);

  const res = await fetch(`https://${RAPIDAPI_HOST}/v1/likes?${params.toString()}`, {
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
  const items = Array.isArray(data?.data?.items) ? data.data.items : [];
  const usernames = items
    .map(l => (l.username ? l.username : l))
    .filter(Boolean);
  const next_cursor = data?.data?.next_cursor || data?.data?.end_cursor || null;
  const has_more = data?.data?.has_more || (next_cursor && next_cursor !== '');
  return { usernames, next_cursor, has_more };
}

export async function fetchInstagramLikesPageRetry(
  shortcode,
  cursor = null,
  retries = 3
) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      if (attempt > 0) {
        sendConsoleDebug('retry fetchInstagramLikesPage', { attempt, shortcode });
      }
      return await fetchInstagramLikesPage(shortcode, cursor);
    } catch (err) {
      attempt++;
      if (attempt >= retries) throw err;
      sendConsoleDebug('fetchInstagramLikesPage error', {
        attempt,
        message: err.message,
      });
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  return { usernames: [], next_cursor: null, has_more: false };
}

export async function fetchAllInstagramLikes(shortcode, maxPage = 20) {
  const all = [];
  let cursor = null;
  let page = 0;
  do {
    const { usernames, next_cursor, has_more } = await fetchInstagramLikesPageRetry(shortcode, cursor);
    if (!usernames.length) break;
    all.push(...usernames);
    cursor = next_cursor;
    page++;
    if (!has_more || !cursor || page >= maxPage) break;
  } while (true);
  return all;
}


export async function searchInstagramUsers(query, limit = 10) {
  if (!query) return [];
  try {
    sendConsoleDebug('searchInstagramUsers request', query);
    const response = await axios.get(`https://${RAPIDAPI_HOST}/v1/search_users`, {
      params: { search_query: query },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });
    const users = Array.isArray(response.data?.data?.users)
      ? response.data.data.users
      : [];
    return limit ? users.slice(0, limit) : users;
  } catch (err) {
    const msg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    const error = new Error(msg);
    error.statusCode = err.response?.status;
    sendConsoleDebug('searchInstagramUsers error', error.message);
    throw error;
  }
}

export async function fetchInstagramCommentsPage(shortcode, token = null) {
  if (!shortcode) return { comments: [], next_token: null, has_more: false };
  const params = new URLSearchParams({ code_or_id_or_url: shortcode });
  if (token) params.append('pagination_token', token);
  const res = await axios.get(`https://${RAPIDAPI_HOST}/v1/comments`, {
    params,
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
      'x-cache-control': 'no-cache'
    }
  });
  const items = Array.isArray(res.data?.data?.items) ? res.data.data.items : [];
  const next_token = res.data?.pagination_token || res.data?.data?.pagination_token || null;
  const has_more = (res.data?.data?.has_more || false) || (next_token && next_token !== '');
  return { comments: items, next_token, has_more };
}

export async function fetchAllInstagramComments(shortcode, maxPage = 10) {
  const all = [];
  let token = null;
  let page = 0;
  do {
    const { comments, next_token, has_more } = await fetchInstagramCommentsPage(shortcode, token);
    if (!comments.length) break;
    all.push(...comments);
    token = next_token;
    page++;
    if (!has_more || !token || page >= maxPage) break;
    await new Promise(r => setTimeout(r, 1500));
  } while (true);
  return all;
}

export async function fetchInstagramHashtag(tag, token = null) {
  if (!tag) return { info: null, items: [], next_token: null, has_more: false };
  const params = new URLSearchParams({ hashtag: tag.replace(/^#/, '') });
  if (token) params.append('pagination_token', token);
  const res = await axios.get(`https://${RAPIDAPI_HOST}/v1/hashtag`, {
    params,
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
      'x-cache-control': 'no-cache'
    }
  });
  const data = res.data?.data || {};
  const info = data?.additional_data || null;
  const items = Array.isArray(data?.items) ? data.items : [];
  const next_token = res.data?.pagination_token || data?.pagination_token || null;
  const has_more = (data?.has_more || false) || (next_token && next_token !== '');
  return { info, items, next_token, has_more };
}
