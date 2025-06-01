// src/service/tiktokCommentService.js

import axios from "axios";
import waClient from "./waService.js";
import dotenv from "dotenv";
dotenv.config();

import { upsertTiktokComments, getCommentsByVideoId } from "../model/tiktokCommentModel.js";

/**
 * Kirim debug ke ADMIN WhatsApp
 */
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
 */
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Fetch semua komentar TikTok via API dan simpan ke DB (append, tidak replace)
 * Paginasi berdasarkan cursor & total. Debug setiap langkah, rate limit 1200ms/request.
 * @param {string} video_id
 * @returns {Array} Array komentar (semua)
 */
export async function fetchAndStoreTiktokComments(video_id) {
  let allComments = [];
  let cursor = 0, page = 1, reqCount = 0;
  let total = null;

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
    let response, data;
    try {
      reqCount++;
      const msgReq = `[DEBUG][fetchKomentar] video_id=${video_id} | page=${page} | cursor=${cursor} | req#${reqCount}`;
      console.log(msgReq);
      sendAdminDebug(msgReq);

      response = await axios.request(options);
      data = response.data;

      // Debug response structure
      const keys = Object.keys(data);
      const dataKeys = data?.data ? Object.keys(data.data) : [];
      sendAdminDebug(`[DEBUG][API_RESPONSE] page=${page} keys=${JSON.stringify(keys)} dataKeys=${JSON.stringify(dataKeys)}`);

    } catch (err) {
      sendAdminDebug(`[ERROR] Gagal fetch komentar TikTok video_id=${video_id} page=${page}: ${err.message}`);
      throw err;
    }

    // Path array komentar dan total: data.data.comments & data.data.total
    let comments = [];
    if (Array.isArray(data?.data?.comments)) {
      comments = data.data.comments;
      if (typeof data.data.total === "number") {
        total = data.data.total;
      }
    } else if (Array.isArray(data?.comments)) {
      comments = data.comments;
      if (typeof data.total === "number") {
        total = data.total;
      }
    }

    sendAdminDebug(`[DEBUG] TikTok Komentar page=${page}, video_id=${video_id}, jml=${comments.length}, cursor=${cursor}, total=${total}`);

    if (!comments.length) break; // STOP paginasi jika data kosong!
    allComments.push(...comments);

    // Cek paginasi: lanjut jika cursor+50 < total, else break
    if (total === null || cursor + 50 >= total) break;
    cursor += 50;
    page++;

    // Rate limit: delay 1200ms per request
    await delay(1200);
  }

  // Gabungkan dengan data lama di DB (avoid duplicate)
  let oldComments = [];
  try {
    const existing = await getCommentsByVideoId(video_id);
    if (Array.isArray(existing.comments)) oldComments = existing.comments;
  } catch {/* ignore */}

  // Gabungkan unik berdasarkan cid/comment_id/id/JSON
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
