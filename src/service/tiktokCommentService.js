import axios from "axios";
import waClient from "./waService.js";
import dotenv from "dotenv";
import pLimit from "p-limit";
dotenv.config();

import { upsertTiktokComments, getCommentsByVideoId } from "../model/tiktokCommentModel.js";

// Helper: Kirim debug ke ADMIN WhatsApp
function sendAdminDebug(msg) {
  const adminWA = (process.env.ADMIN_WHATSAPP || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => (n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"));
  for (const wa of adminWA) {
    waClient.sendMessage(wa, `[CICERO DEBUG]\n${msg}`).catch(() => {});
  }
}

/**
 * Helper delay (rate limiting)
 * @param {number} ms
 * @returns {Promise}
 */
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Fetch semua komentar TikTok via API dan simpan ke DB (append, no replace)
 * Paginasi otomatis, debug setiap page, rate limiting 650ms/request
 * @param {string} video_id
 * @returns {Array} Array komentar (asli)
 */
export async function fetchAndStoreTiktokComments(video_id) {
  let allComments = [];
  let cursor = 0, page = 1, reqCount = 0;
  let hasMore = true;

  while (hasMore) {
    const options = {
      method: "GET",
      url: "https://tiktok-api23.p.rapidapi.com/api/post/comments",
      params: {
        videoId: video_id,
        count: "50",
        cursor: String(cursor)
      },
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": "tiktok-api23.p.rapidapi.com"
      }
    };

    let response, data, pageComments = [];
    try {
      reqCount++;
      const msgReq = `[DEBUG][fetchKomentar] video_id=${video_id} | page=${page} | cursor=${cursor} | req#${reqCount}`;
      console.log(msgReq);
      sendAdminDebug(msgReq);

      response = await axios.request(options);
      data = response.data;
    } catch (err) {
      sendAdminDebug(`[ERROR] Gagal fetch komentar TikTok video_id=${video_id} page=${page}: ${err.message}`);
      throw err;
    }

    // PATCH: Path benar adalah data.data.comments, data.data.has_more, data.data.next_cursor
    pageComments = Array.isArray(data?.data?.comments) ? data.data.comments : [];
    hasMore = !!data?.data?.has_more;
    const nextCursor = data?.data?.next_cursor;

    sendAdminDebug(`[DEBUG] TikTok Komentar page=${page}, video_id=${video_id}, jml=${pageComments.length}, has_more=${hasMore}, next_cursor=${nextCursor}`);

    allComments.push(...pageComments);

    if (!hasMore || !nextCursor) break;
    cursor = nextCursor;
    page++;

    // Rate limit: delay 650ms per request
    await delay(2000);
  }

  // Gabungkan komentar baru dan lama, hindari duplikat
  let oldComments = [];
  try {
    const existing = await getCommentsByVideoId(video_id);
    if (Array.isArray(existing.comments)) {
      oldComments = existing.comments;
    }
  } catch { /* ignore error */ }

  // Gabungkan, unique by cid/comment_id/id (atau full JSON)
  const uniqMap = {};
  [...oldComments, ...allComments].forEach((c) => {
    const key = c?.cid || c?.comment_id || c?.id || JSON.stringify(c);
    uniqMap[key] = c;
  });
  const finalComments = Object.values(uniqMap);

  // SIMPAN KE DB
  await upsertTiktokComments(video_id, finalComments);
  sendAdminDebug(`[DEBUG] Sudah simpan ${finalComments.length} komentar ke DB untuk video_id=${video_id}`);
  return finalComments;
}

/**
 * Proses batch fetch komentar seluruh video TikTok
 * @param {string[]} videoIds - Array of TikTok video IDs
 * @returns {Promise<Array>} - Array hasil per video (array komentar per video)
 */
export async function fetchCommentsBatch(videoIds) {
  const limit = pLimit(1); // Max 8 video berjalan bersamaan
  const tasks = videoIds.map(video_id =>
    limit(() => fetchAndStoreTiktokComments(video_id))
  );
  // Semua komentar sudah diambil & disimpan DB, hasil: [[komen], [komen], ...]
  return Promise.all(tasks);
}
