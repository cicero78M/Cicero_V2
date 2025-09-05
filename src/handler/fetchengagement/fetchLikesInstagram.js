// src/handler/fetchengagement/fetchLikesInstagram.js

import { query } from "../../db/index.js";
import { sendDebug } from "../../middleware/debugHandler.js";
import { fetchAllInstagramLikes } from "../../service/instagramApi.js";
import { getAllExceptionUsers } from "../../model/userModel.js";

function normalizeUsername(username) {
  return (username || "")
    .toString()
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

// Ambil likes lama (existing) dari database dan kembalikan sebagai array string
async function getExistingLikes(shortcode) {
  const res = await query(
    "SELECT likes FROM insta_like WHERE shortcode = $1",
    [shortcode]
  );
  if (!res.rows.length) return [];
  const val = res.rows[0].likes;
  if (!val) return [];
  if (Array.isArray(val)) return val.map(normalizeUsername);
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(normalizeUsername);
      return [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Ambil likes dari Instagram, upsert ke DB insta_like
 * @param {string} shortcode
 * @param {string|null} client_id
 */
async function fetchAndStoreLikes(shortcode, client_id = null) {
  const allLikes = await fetchAllInstagramLikes(shortcode);
  const uniqueLikes = [...new Set(allLikes.map(normalizeUsername))];

  let limitedLikes = uniqueLikes;
  if (uniqueLikes.length > 50) {
    limitedLikes = uniqueLikes.slice(0, 50);
    const exceptionUsers = await getAllExceptionUsers();
    const exceptionSet = new Set(
      exceptionUsers.map((u) => normalizeUsername(u.insta))
    );
    for (const uname of uniqueLikes) {
      if (exceptionSet.has(uname)) {
        limitedLikes.push(uname);
      }
    }
    limitedLikes = [...new Set(limitedLikes)];
  }

  const existingLikes = await getExistingLikes(shortcode);
  const mergedSet = new Set([...existingLikes, ...limitedLikes]);
  const mergedLikes = [...mergedSet];
  sendDebug({
    tag: "IG LIKES FINAL",
    msg: `Shortcode ${shortcode} FINAL jumlah unique: ${mergedLikes.length}`,
    client_id: client_id || shortcode,
  });

  // Simpan ke database (upsert), gabungkan dengan data lama
  await query(
    `INSERT INTO insta_like (shortcode, likes, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (shortcode) DO UPDATE
     SET likes = EXCLUDED.likes, updated_at = NOW()`,
    [shortcode, JSON.stringify(mergedLikes)]
  );

  sendDebug({
    tag: "IG FETCH",
    msg: `[DB] Sukses upsert likes IG: ${shortcode} | Total likes disimpan: ${mergedLikes.length}`,
    client_id: client_id || shortcode,
  });
}

/**
 * Handler fetch likes Instagram untuk 1 client
 * Akan fetch semua post IG milik client hari ini,
 * lalu untuk setiap post akan fetch likes dan simpan ke DB (upsert).
 * @param {*} waClient - instance WhatsApp client (untuk progress)
 * @param {*} chatId - WhatsApp chatId (untuk notifikasi)
 * @param {*} client_id - client yang ingin di-fetch likes-nya
 */
export async function handleFetchLikesInstagram(waClient, chatId, client_id) {
  try {
    // Ambil semua post IG milik client hari ini
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const { rows } = await query(
      `SELECT shortcode FROM insta_post WHERE client_id = $1 AND DATE(created_at) = $2`,
      [client_id, `${yyyy}-${mm}-${dd}`]
    );

    if (!rows.length) {
      if (waClient && chatId) {
        await waClient.sendMessage(
          chatId,
          `Tidak ada konten IG hari ini untuk client ${client_id}.`
        );
      }
      return;
    }

    let sukses = 0, gagal = 0;
    for (const r of rows) {
      try {
        await fetchAndStoreLikes(r.shortcode, client_id);
        sukses++;
      } catch (err) {
        sendDebug({
          tag: "IG FETCH LIKES ERROR",
          // Hanya log message/error string, jangan objek error utuh!
          msg: `Gagal fetch likes untuk shortcode: ${r.shortcode}, error: ${(err && err.message) || String(err)}`,
          client_id,
        });
        gagal++;
      }
    }

    if (waClient && chatId) {
      await waClient.sendMessage(
        chatId,
        `✅ Selesai fetch likes IG client ${client_id}. Berhasil: ${sukses}, Gagal: ${gagal}`
      );
    }
  } catch (err) {
    if (waClient && chatId) {
      await waClient.sendMessage(
        chatId,
        `❌ Error utama fetch likes IG: ${(err && err.message) || String(err)}`
      );
    }
    sendDebug({
      tag: "IG FETCH LIKES ERROR",
      msg: (err && err.message) || String(err),
      client_id,
    });
  }
}
