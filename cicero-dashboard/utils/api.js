const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export async function login(client_id, client_operator) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id, client_operator })
  });
  return await res.json();
}

export async function getClientProfile(token, client_id) {
  const res = await fetch(`${API_URL}/clients/${client_id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return await res.json();
}

export async function getInstagramProfileViaBackend(token, username) {
  const url = `${API_URL}/insta/profile?username=${encodeURIComponent(username)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return await res.json();
}

export async function getInstagramPostsViaBackend(token, username, limit = 50) {
  const url = `${API_URL}/insta/posts?username=${encodeURIComponent(username)}&limit=${limit}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return await res.json();
}
