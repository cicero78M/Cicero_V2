import axios from "axios";
import waClient from "./waService.js";
import dotenv from "dotenv";
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
    } catch (err) {
      sendAdminDebug(`[ERROR] Gagal fetch komentar TikTok video_id=${video_id} page=${page}: ${err.message}`);
      throw err;
    }

    // Path array komentar: data.comments atau data.data.comments
    let comments = [];
    if (Array.isArray(data?.comments)) {
      comments = data.comments;
    } else if (Array.isArray(data?.data?.comments)) {
      comments = data.data.comments;
    }
    sendAdminDebug(`[DEBUG] TikTok Komentar page=${page}, video_id=${video_id}, jml=${comments.length}`);
    allComments.push(...comments);

    // Hentikan paginasi jika sudah habis atau API tidak mendukung next
    if (!comments.length || !data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
    page++;

    // Rate limit: delay 650ms per request
    await delay(650);
  }

  // --- Gabungkan komentar baru dan lama, hindari duplikat ---
  let oldComments = [];
  try {
    const existing = await getCommentsByVideoId(video_id);
    if (Array.isArray(existing.comments)) {
      oldComments = existing.comments;
    }
  } catch { /* ignore, kosongkan saja jika error */ }
  // Gabungkan, unique by comment_id/userid (atau full JSON)
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
