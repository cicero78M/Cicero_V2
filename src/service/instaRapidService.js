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

