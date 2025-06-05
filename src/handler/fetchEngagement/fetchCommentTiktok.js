// src/service/tiktokCommentService.js

import axios from "axios";
import pLimit from "p-limit";
import { pool } from "../../config/db.js";
import { sendDebug } from "../../middleware/debugHandler.js";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "social-api4.p.rapidapi.com";
const limit = pLimit(4);

/**
 * Ambil daftar video_id TikTok hari ini dari DB.
 */
async function getVideoIdsToday(client_id = null) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  let query = `SELECT video_id FROM tiktok_post WHERE DATE(created_at) = $1`;
  let params = [`${yyyy}-${mm}-${dd}`];
  if (client_id) {
    query += ` AND client_id = $2`;
    params.push(client_id);
  }
  const res = await pool.query(query, params);
  return res.rows.map((r) => r.video_id);
}

/**
 * Fetch semua username pemberi komentar pada satu video TikTok.
 */
async function fetchAllTiktokCommentUsernames(video_id) {
  let allUsernames = [];
  let nextCursor = null;
  let page = 1;
  const maxTry = 15;
  do {
    let params = { video_id };
    if (nextCursor) params.cursor = nextCursor;
    let commentsRes;
    try {
      commentsRes = await axios.get(`https://${RAPIDAPI_HOST}/v1/comments`, {
        params,
        headers: {
          "x-cache-control": "no-cache",
          "X-RapidAPI-Key": RAPIDAPI_KEY,
          "X-RapidAPI-Host": RAPIDAPI_HOST,
        },
      });
    } catch (e) {
      sendDebug({
        tag: "TTK COMMENT ERROR",
        msg: `Fetch gagal: ${e.response?.data ? JSON.stringify(e.response.data) : e.message}`,
        client_id: video_id
      });
      break;
    }
    const items = commentsRes.data?.data?.items || [];
    sendDebug({
      tag: "TTK COMMENT",
      msg: `Video ${video_id} Page ${page}: ${items.length} komentar`,
      client_id: video_id
    });
    allUsernames.push(...items.map((c) => c.user?.unique_id).filter(Boolean));
    nextCursor = commentsRes.data?.data?.next_cursor || null;
    const hasMore = commentsRes.data?.data?.has_more || (nextCursor && nextCursor !== "");
    if (!hasMore || !nextCursor || page++ >= maxTry) break;
  } while (true);

  // Unik
  const result = [...new Set(allUsernames)];
  sendDebug({
    tag: "TTK COMMENT",
    msg: `Video ${video_id}: Jumlah username komentar unik (hasil fetch): ${result.length}`,
    client_id: video_id
  });
  return result;
}

/**
 * Ambil existing username dari DB (comments jsonb).
 */
async function getExistingUsernames(video_id) {
  const res = await pool.query(
    "SELECT comments FROM tiktok_comment WHERE video_id = $1",
    [video_id]
  );
  if (res.rows.length && Array.isArray(res.rows[0].comments)) {
    return res.rows[0].comments;
  }
  return [];
}

/**
 * Upsert hasil merge username ke DB.
 */
async function upsertTiktokCommentUsernamesMerged(video_id, usernames) {
  const query = `
    INSERT INTO tiktok_comment (video_id, comments, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (video_id)
    DO UPDATE SET comments = EXCLUDED.comments, updated_at = EXCLUDED.updated_at
  `;
  await pool.query(query, [video_id, JSON.stringify(usernames)]);
}

/**
 * Main: fetch & store TikTok comments (merge dengan existing username).
 */
export async function fetchAndStoreTiktokCommentUserList(waClient = null, chatId = null, client_id = null) {
  let processing = true;
  if (!waClient)
    sendDebug({ tag: "TTK COMMENT", msg: "fetchAndStoreTiktokCommentUserList: mode cronjob/auto" });
  else
    sendDebug({ tag: "TTK COMMENT", msg: "fetchAndStoreTiktokCommentUserList: mode WA handler" });

  const intervalId = setInterval(() => {
    if (processing && waClient && chatId && typeof waClient.sendMessage === "function") {
      waClient.sendMessage(chatId, "⏳ Sedang fetch username komentar TikTok...");
    }
  }, 5000);

  const videoIds = await getVideoIdsToday(client_id);
  sendDebug({
    tag: "TTK COMMENT",
    msg: `Jumlah video_id hari ini: ${videoIds.length}`
  });

  let totalNew = 0, totalUnique = 0;
  for (const video_id of videoIds) {
    await limit(async () => {
      // Fetch username terbaru hari ini
      const usernamesToday = await fetchAllTiktokCommentUsernames(video_id);
      // Ambil existing dari DB
      const usernamesExisting = await getExistingUsernames(video_id);
      // Merge
      const mergedUsernames = [...new Set([...(usernamesExisting || []), ...usernamesToday])];
      totalNew += usernamesToday.length;
      totalUnique += mergedUsernames.length;
      // Simpan
      await upsertTiktokCommentUsernamesMerged(video_id, mergedUsernames);
      sendDebug({
        tag: "TTK COMMENT",
        msg: `Video ${video_id}: total username komentar unik setelah merge: ${mergedUsernames.length}`,
        client_id: video_id
      });
    });
  }

  processing = false;
  clearInterval(intervalId);

  const msg = `✅ Merge fetch username komentar TikTok selesai!\nVideo hari ini: *${videoIds.length}*\nTotal username hasil fetch hari ini: *${totalNew}*\nTotal username unik setelah merge (semua video): *${totalUnique}*`;
  if (waClient && chatId) {
    await waClient.sendMessage(chatId, msg);
  } else {
    sendDebug({ tag: "TTK COMMENT", msg });
  }
}
