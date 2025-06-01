import axios from "axios";
import waClient from "./waService.js";
import dotenv from "dotenv";
dotenv.config();

import { upsertTiktokComments, getCommentsByVideoId } from "../model/tiktokCommentModel.js";

// Helper: Kirim debug ke ADMIN WhatsApp
function sendAdminDebug(msg) {
  const adminWA = (process.env.ADMIN_WHATSAPP || "")
    .split(",")
    .map(n => n.trim())
    .filter(Boolean)
    .map(n => (n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"));
  for (const wa of adminWA) {
    waClient.sendMessage(wa, `[CICERO DEBUG]\n${msg}`).catch(() => {});
  }
}

// Helper delay (rate limiting)
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Fetch semua komentar TikTok via API dan simpan ke DB (append, tidak replace)
 * Paginate: cursor = 0, 50, 100, ... stop jika next_cursor >= total+50 atau komentar kosong
 * @param {string} video_id
 * @returns {Array} Array komentar (asli)
 */
export async function fetchAndStoreTiktokComments(video_id) {
  let allComments = [];
  let cursor = 0, page = 1, reqCount = 0, total = null;
  while (true) {
    const options = {
      method: 'GET',
      url: 'https://tiktok-api23.p.rapidapi.com/api/post/comments',
      params: {
        videoId: video_id,
        count: '50',
        cursor: String(cursor)
      },
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com'
      }
    };
    let response, data, comments, nextCursor;
    try {
      reqCount++;
      sendAdminDebug(`[DEBUG][fetchKomentar] video_id=${video_id} | page=${page} | cursor=${cursor} | req#${reqCount}`);

      response = await axios.request(options);
      data = response.data;
      comments = Array.isArray(data?.data?.comments) ? data.data.comments : [];
      total = typeof data?.data?.total === "number" ? data.data.total : null;
      nextCursor = typeof data?.data?.next_cursor === "number" ? data.data.next_cursor : null;
    } catch (err) {
      sendAdminDebug(`[ERROR] Gagal fetch komentar TikTok video_id=${video_id} page=${page}: ${err.message}`);
      throw err;
    }

    sendAdminDebug(`[DEBUG] TikTok Komentar page=${page}, video_id=${video_id}, jml=${comments.length}, cursor=${cursor}, total=${total}, next_cursor=${nextCursor}`);
    if (!comments.length) break;
    allComments.push(...comments);

    // Stop jika next_cursor >= total+50 atau tidak ada next_cursor
    if (!nextCursor || (total !== null && nextCursor >= (total + 50))) break;

    // Rate limit: 2000 ms per request
    cursor = nextCursor;
    page++;
    await delay(2000);
  }

  // Gabungkan unik (hindari duplikat), merge dgn DB
  let oldComments = [];
  try {
    const existing = await getCommentsByVideoId(video_id);
    if (Array.isArray(existing.comments)) oldComments = existing.comments;
  } catch {/* ignore */}

  const uniqMap = {};
  [...oldComments, ...allComments].forEach((c) => {
    const key = c?.cid || c?.comment_id || c?.id || JSON.stringify(c);
    uniqMap[key] = c;
  });
  const finalComments = Object.values(uniqMap);

  // Simpan ke DB
  await upsertTiktokComments(video_id, finalComments);
  sendAdminDebug(`[DEBUG] Sudah simpan ${finalComments.length} komentar ke DB untuk video_id=${video_id}`);
  return finalComments;
}
