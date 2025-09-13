const API_BASE_URL = process.env.API_BASE_URL || '';

export async function getClientNamesBatch(clientIds, authHeader = '') {
  const uniqueIds = Array.from(new Set(clientIds));
  const response = await fetch(`${API_BASE_URL}/api/clients/names`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify({ client_id: uniqueIds }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch client names');
  }

  return response.json();
}
