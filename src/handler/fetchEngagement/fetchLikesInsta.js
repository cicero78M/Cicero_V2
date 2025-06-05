// src/handler/fetchEngagement/fetchLikesInsta.js

import axios from "axios";
import pLimit from "p-limit";
import * as instaLikeModel from "../../model/instaLikeModel.js";
import { pool } from "../../config/db.js";
import { sendDebug } from "../../middleware/debugHandler.js";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "social-api4.p.rapidapi.com";
const limit = pLimit(3); // fetch likes lebih kecil agar aman

// Helper: ambil username IG dari DB
async function getClientInstaUsername(client_id) {
  const res = await pool.query(
    `SELECT client_insta FROM clients WHERE client_id = $1 LIMIT 1`, [client_id]
  );
  if (res.rows[0] && res.rows[0].client_insta)
    return res.rows[0].client_insta.replace(/^@/, "");
  return null;
}

// ==== FUNGSI UTAMA: FETCH & STORE LIKES PER POST (SHORTCODE) ====
export async function fetchAndStoreLikes(shortcode, client_id = null) {
  // Pagination likes (max 20 page)
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
        msg: `Fetch likes page gagal: ${e.response?.data ? JSON.stringify(e.response.data) : e.message}`,
        client_id: shortcode
      });
      break;
    }

    const likeItems = likesRes.data?.data?.items || [];
    sendDebug({
      tag: "IG LIKES PAGE",
      msg: `Shortcode ${shortcode} Page ${page}: ${likeItems.length} username`,
      client_id: client_id || shortcode
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
      client_id: client_id || shortcode
    });

    if (!hasMore || !nextCursor || page++ >= maxTry) break;
  } while (true);

  const result = [...new Set(allLikes)];
  sendDebug({
    tag: "IG LIKES PAGING",
    msg: `Shortcode ${shortcode} FINAL jumlah unique: ${result.length}`,
    client_id: client_id || shortcode
  });

  // DB LIKE: merge dengan likes di DB
  const dbLike = await instaLikeModel.getLikeUsernamesByShortcode(shortcode);
  let mergedLikes = result;
  if (dbLike) {
    sendDebug({
      tag: "IG DB LIKE",
      msg: `Likes di DB sebelum merge (${shortcode}): jumlah=${dbLike.length}`,
      client_id: client_id || shortcode
    });
    mergedLikes = [...new Set([...dbLike, ...result])];
  }
  sendDebug({
    tag: "IG DB LIKE",
    msg: `Likes setelah merge untuk ${shortcode}: jumlah=${mergedLikes.length}`,
    client_id: client_id || shortcode
  });

  await instaLikeModel.upsertInstaLike(shortcode, mergedLikes);
  sendDebug({
    tag: "IG FETCH",
    msg: `[DB] Sukses upsert likes IG: ${shortcode} | Total likes disimpan: ${mergedLikes.length}`,
    client_id: client_id || shortcode
  });
}

// ==== HANDLER UTAMA UNTUK MENU ADMIN/WA ====
export async function handleFetchLikesInstagram(waClient, chatId, client_id) {
  // Validasi username IG client
  const username = await getClientInstaUsername(client_id);
  if (!username) {
    await waClient.sendMessage(
      chatId,
      `❌ Username Instagram kosong di database untuk client ${client_id}. Silakan update data client terlebih dahulu.`
    );
    return;
  }

  // Ambil seluruh konten hari ini dari client tsb
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  const { rows } = await pool.query(
    `SELECT shortcode FROM insta_post WHERE client_id = $1 AND DATE(created_at) = $2`,
    [client_id, `${yyyy}-${mm}-${dd}`]
  );

  if (!rows.length) {
    await waClient.sendMessage(
      chatId,
      `Tidak ditemukan posting IG hari ini untuk client ${client_id}.`
    );
    return;
  }

  let resultMsg = `*Rekap likes Instagram @${username} hari ini:*\n`;
  let updated = 0;
  for (const row of rows) {
    await fetchAndStoreLikes(row.shortcode, client_id);
    resultMsg += `- https://www.instagram.com/p/${row.shortcode}\n`;
    updated++;
  }

  await waClient.sendMessage(
    chatId,
    `✅ Selesai update likes untuk ${updated} posting hari ini.\n\n${resultMsg}`
  );
}
