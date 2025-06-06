// src/handler/fetchEngagement/fetchLikesInstagram.js

import axios from "axios";
import pLimit from "p-limit";
import { pool } from "../../config/db.js";
import { sendDebug } from "../../middleware/debugHandler.js";

// Konfigurasi RapidAPI
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "social-api4.p.rapidapi.com";
const limit = pLimit(3); // Rate limit parallel request

/**
 * Ambil likes dari Instagram, upsert ke DB insta_like
 * @param {string} shortcode
 * @param {string|null} client_id
 */
async function fetchAndStoreLikes(shortcode, client_id = null) {
  // Paginate likes (max 20 page)
  let allLikes = [];
  let nextCursor = null;
  let page = 1;
  const maxTry = 20;
  do {
    let params = { code_or_id_or_url: shortcode };
    if (nextCursor) params.cursor = nextCursor;

    let likesRes;
    try {
      likesRes = await axios.get(`https://${RAPIDAPI_HOST}/v1/likes`, {
        params,
        headers: {
          "x-cache-control": "no-cache",
          "X-RapidAPI-Key": RAPIDAPI_KEY,
          "X-RapidAPI-Host": RAPIDAPI_HOST,
        },
      });
    } catch (e) {
      sendDebug({
        tag: "IG LIKES ERROR",
        msg: `Fetch likes page gagal: ${e.response?.data ? JSON.stringify(e.response.data) : (e.message || String(e))}`,
        client_id: shortcode
      });
      break;
    }

    const likeItems = likesRes.data?.data?.items || [];
    sendDebug({
      tag: "IG LIKES PAGE",
      msg: `Shortcode ${shortcode} Page ${page}: ${likeItems.length} username`,
      client_id: client_id || shortcode,
    });

    allLikes.push(
      ...likeItems
        .map((like) => (like.username ? like.username : like))
        .filter(Boolean)
    );

    nextCursor =
      likesRes.data?.data?.next_cursor ||
      likesRes.data?.data?.end_cursor ||
      null;
    const hasMore =
      likesRes.data?.data?.has_more || (nextCursor && nextCursor !== "");

    sendDebug({
      tag: "IG LIKES PAGING",
      msg: `Shortcode ${shortcode} Total fetched sementara: ${allLikes.length} | next_cursor: ${!!nextCursor}`,
      client_id: client_id || shortcode,
    });

    if (!hasMore || !nextCursor || page++ >= maxTry) break;
  } while (true);

  const uniqueLikes = [...new Set(allLikes)];
  sendDebug({
    tag: "IG LIKES FINAL",
    msg: `Shortcode ${shortcode} FINAL jumlah unique: ${uniqueLikes.length}`,
    client_id: client_id || shortcode,
  });

  // Simpan ke database (upsert)
  await pool.query(
    `INSERT INTO insta_like (shortcode, likes, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (shortcode) DO UPDATE
     SET likes = EXCLUDED.likes, updated_at = NOW()`,
    [shortcode, JSON.stringify(uniqueLikes)]
  );

  sendDebug({
    tag: "IG FETCH",
    msg: `[DB] Sukses upsert likes IG: ${shortcode} | Total likes disimpan: ${uniqueLikes.length}`,
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
    const { rows } = await pool.query(
      `SELECT shortcode FROM insta_post WHERE client_id = $1 AND DATE(created_at) = $2`,
      [client_id, `${yyyy}-${mm}-${dd}`]
    );

    if (!rows.length) {
      await waClient.sendMessage(chatId, `Tidak ada konten IG hari ini untuk client ${client_id}.`);
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
          client_id
        });
        gagal++;
      }
    }

    await waClient.sendMessage(
      chatId,
      `✅ Selesai fetch likes IG client ${client_id}. Berhasil: ${sukses}, Gagal: ${gagal}`
    );
  } catch (err) {
    await waClient.sendMessage(
      chatId,
      `❌ Error utama fetch likes IG: ${(err && err.message) || String(err)}`
    );
    sendDebug({
      tag: "IG FETCH LIKES ERROR",
      msg: (err && err.message) || String(err),
      client_id
    });
  }
}
