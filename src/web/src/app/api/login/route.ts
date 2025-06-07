import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../../config/db.js'; // PASTIKAN path sudah benar!

export async function POST(req: NextRequest) {
  const { client_id, client_operator } = await req.json();

  // Admin: akses seluruh data
  if (
    client_id === process.env.ADMIN_CLIENT_ID &&
    client_operator === process.env.ADMIN_OPERATOR
  ) {
    return NextResponse.json({
      success: true,
      token: "admintoken",
      role: "admin",
    });
  }

  // Client: akses terbatas by client_id
  const res = await pool.query(
    "SELECT client_id, client_operator FROM clients WHERE client_id = $1 AND client_operator = $2 LIMIT 1",
    [client_id, client_operator]
  );
  if (res.rows.length === 1) {
    return NextResponse.json({
      success: true,
      token: `${client_id}-token`, // Atur sesuai kebutuhan
      role: "client",
      client_id,
    });
  }
  return NextResponse.json({ success: false, message: "Login gagal!" }, { status: 401 });
}
