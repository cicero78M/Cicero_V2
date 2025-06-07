import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../../src/config/db.js"; // Pastikan path sudah benar

// GET semua user (role=admin), atau filter by client_id (role=client)
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const client_id = searchParams.get("client_id"); // opsional

  let query = "SELECT * FROM users";
  let params: any[] = [];
  if (client_id) {
    query += " WHERE client_id = $1";
    params = [client_id];
  }
  query += " ORDER BY divisi, nama";
  const res = await pool.query(query, params);
  return NextResponse.json(res.rows);
}
