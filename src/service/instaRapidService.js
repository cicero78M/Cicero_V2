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
    throw new Error(text);
  }
  const data = await res.json();
  const items = data?.data?.items || [];
  return limit ? items.slice(0, limit) : items;
}

export async function fetchInstagramProfile(username) {
  if (!username) return null;
  const params = new URLSearchParams({ username_or_id_or_url: username });

  const res = await fetch(`https://${RAPIDAPI_HOST}/v1/profile?${params.toString()}`, {
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
      'x-cache-control': 'no-cache'
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  const data = await res.json();
  return data?.data || null;
}
