import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { isAdminWhatsApp, formatToWhatsAppId } from "../utils/waHelper.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { client_id, client_operator } = req.body;
  // Validasi input
  if (!client_id || !client_operator) {
    return res
      .status(400)
      .json({
        success: false,
        message: "client_id dan client_operator wajib diisi",
      });
  }
  // Cari client berdasarkan ID saja
  const { rows } = await pool.query(
    "SELECT * FROM clients WHERE client_id = $1",
    [client_id]
  );
  const client = rows[0];
  // Jika client tidak ditemukan
  if (!client) {
    return res.status(401).json({
      success: false,
      message: "Login gagal: client_id tidak ditemukan",
    });
  }

  // Cek operator yang diberikan: boleh operator asli atau admin
  const inputId = formatToWhatsAppId(client_operator);
  const dbOperator = client.client_operator
    ? formatToWhatsAppId(client.client_operator)
    : "";

  const isValidOperator =
    inputId === dbOperator ||
    client_operator === client.client_operator ||
    isAdminWhatsApp(inputId) ||
    isAdminWhatsApp(client_operator);

  if (!isValidOperator) {
    return res.status(401).json({
      success: false,
      message: "Login gagal: client operator tidak valid",
    });
  }
  // Generate JWT token
  const payload = {
    client_id: client.client_id,
    nama: client.nama,
    role: "client",
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET || "secretkey", {
    expiresIn: "2h",
  });
  // Kembalikan token dan data client
  return res.json({ success: true, token, client: payload });
});

export default router;
