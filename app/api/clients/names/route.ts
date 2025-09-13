import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { client_ids, clientIds } = await req.json();
    const ids = client_ids || clientIds;

    const authHeader = req.headers.get('authorization') || '';

    const response = await fetch(`${process.env.API_BASE_URL}/api/clients/names`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ client_ids: ids }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

