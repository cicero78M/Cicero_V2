// src/handler/fetchEngagement/fetchCommentTiktok.js

import axios from "axios";
import pLimit from "p-limit";
import { pool } from "../../config/db.js";
import { sendDebug } from "../../middleware/debugHandler.js";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "tiktok-api23.p.rapidapi.com";
const limit = pLimit(3); // atur parallel fetch sesuai kebutuhan

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

/**
 * Fetch semua komentar TikTok untuk 1 video_id dari API terbaru
 * Return: array komentar (object asli dari API)
 */
async function fetchAllTiktokComments(video_id) {
  let allComments = [];
  let cursor = 0, page = 1, reqCount = 0;
  let total = null;
  while (true) {
    const options = {
      method: 'GET',
      url: `https://${RAPIDAPI_HOST}/api/post/comments`,
      params: {
        videoId: video_id,
        count: '50',
        cursor: String(cursor)
      },
      headers: {
        "x-cache-control": "no-cache",
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
      }
    };
    let response, data;
    try {
      reqCount++;
      const msgReq = `[DEBUG][fetchKomentar] video_id=${video_id} | page=${page} | cursor=${cursor} | req#${reqCount}`;
      console.log(msgReq);
      sendDebug({ tag: "TTK COMMENT REQ", msg: msgReq, client_id: video_id });

      response = await axios.request(options);
      data = response.data;

      // Debug response structure
      const keys = Object.keys(data);
      const dataKeys = data?.data ? Object.keys(data.data) : [];
      sendDebug({
        tag: "TTK COMMENT API_RESPONSE",
        msg: `[page=${page}] keys=${JSON.stringify(keys)} dataKeys=${JSON.stringify(dataKeys)}`,
        client_id: video_id
      });
    } catch (err) {
      sendDebug({
        tag: "TTK COMMENT ERROR",
        msg: `[ERROR] Gagal fetch komentar TikTok video_id=${video_id} page=${page}: ${err.message}`,
        client_id: video_id
      });
      break;
    }

    let comments = [];
    if (Array.isArray(data?.data?.comments)) {
      comments = data.data.comments;
      if (typeof data.data.total === "number") total = data.data.total;
    } else if (Array.isArray(data?.comments)) {
      comments = data.comments;
      if (typeof data.total === "number") total = data.total;
    }
    sendDebug({
      tag: "TTK COMMENT PAGE",
      msg: `Video ${video_id} Page ${page}: ${comments.length} komentar, cursor=${cursor}, total=${total}`,
      client_id: video_id
    });

    if (!comments.length) break;
    allComments.push(...comments);

    if (total !== null && cursor > (total + 50)) break;
    cursor += 50;
    page++;

    await delay(2000); // rate limit
  }
  return allComments;
}

/**
 * Ekstrak & normalisasi username dari array objek komentar TikTok.
 * Diprioritaskan dari: user.unique_id, fallback: username (kalau ada)
 * Return: array string username unik (lowercase, tanpa @)
 */
function extractUniqueUsernamesFromComments(commentsArr) {
  const usernames = [];
  for (const c of commentsArr) {
    let uname = null;
    if (c && c.user && typeof c.user.unique_id === "string") {
      uname = c.user.unique_id;
    } else if (c && typeof c.username === "string") {
      uname = c.username;
    }
    if (uname && uname.length > 0)
      usernames.push(uname.trim().toLowerCase().replace(/^@/, ""));
  }
  // Unikkan username (no duplicate)
  return [...new Set(usernames)];
}

// Ambil komentar lama (existing) dari DB (username string array)
async function getExistingUsernames(video_id) {
  const res = await pool.query(
    "SELECT comments FROM tiktok_comment WHERE video_id = $1",
    [video_id]
  );
  if (res.rows.length && Array.isArray(res.rows[0].comments)) {
    // pastikan string array
    return res.rows[0].comments
      .map(u => (typeof u === "string" ? u.trim().toLowerCase().replace(/^@/, "") : null))
      .filter(Boolean);
  }
  return [];
}

/**
 * Upsert ke DB hanya username (string array).
 * - Gabungkan username baru + lama, unikkan.
 */
async function upsertTiktokUserComments(video_id, usernamesArr) {
  // Existing username dari DB
  const existing = await getExistingUsernames(video_id);
  const finalUsernames = [...new Set([...existing, ...usernamesArr])];

  const query = `
    INSERT INTO tiktok_comment (video_id, comments, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (video_id)
    DO UPDATE SET comments = $2, updated_at = NOW()
  `;
  await pool.query(query, [video_id, JSON.stringify(finalUsernames)]);
  return finalUsernames;
}

/**
 * Handler: Fetch komentar semua video TikTok hari ini (per client)
 * Simpan ke DB: hanya array username unik!
 */
export async function handleFetchKomentarTiktokBatch(waClient = null, chatId = null, client_id = null) {
  try {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const { rows } = await pool.query(
      `SELECT video_id FROM tiktok_post WHERE client_id = $1 AND DATE(created_at) = $2`,
      [client_id, `${yyyy}-${mm}-${dd}`]
    );
    const videoIds = rows.map((r) => r.video_id);
    sendDebug({
      tag: "TTK COMMENT",
      msg: `Client ${client_id}: Jumlah video hari ini: ${videoIds.length}`,
      client_id,
    });
    if (waClient && chatId) {
      await waClient.sendMessage(chatId, `⏳ Fetch komentar ${videoIds.length} video TikTok...`);
    }

    if (!videoIds.length) {
      if (waClient && chatId) await waClient.sendMessage(chatId, `Tidak ada konten TikTok hari ini untuk client ${client_id}.`);
      sendDebug({
        tag: "TTK COMMENT",
        msg: `Tidak ada video TikTok untuk client ${client_id} hari ini.`,
        client_id,
      });
      return;
    }

    let sukses = 0, gagal = 0;
    for (const video_id of videoIds) {
      await limit(async () => {
        try {
          const commentsToday = await fetchAllTiktokComments(video_id);
          const uniqueUsernames = extractUniqueUsernamesFromComments(commentsToday);
          const mergedUsernames = await upsertTiktokUserComments(
            video_id,
            uniqueUsernames
          );
          sukses++;
          sendDebug({
            tag: "TTK COMMENT MERGE",
            msg: `Video ${video_id}: Berhasil simpan/merge komentar (${mergedUsernames.length} username unik)`,
            client_id: video_id
          });
        } catch (err) {
          sendDebug({
            tag: "TTK COMMENT ERROR",
            msg: `Gagal fetch/merge video ${video_id}: ${(err && err.message) || String(err)}`,
            client_id: video_id
          });
          gagal++;
        }
      });
    }

    if (waClient && chatId) {
      await waClient.sendMessage(
        chatId,
        `✅ Selesai fetch komentar TikTok client ${client_id}. Berhasil: ${sukses}, Gagal: ${gagal}`
      );
    }
    sendDebug({
      tag: "TTK COMMENT FINAL",
      msg: `Fetch komentar TikTok client ${client_id} selesai. Berhasil: ${sukses}, Gagal: ${gagal}`,
      client_id,
    });

  } catch (err) {
    if (waClient && chatId) {
      await waClient.sendMessage(
        chatId,
        `❌ Error utama fetch komentar TikTok: ${(err && err.message) || String(err)}`
      );
    }
    sendDebug({
      tag: "TTK COMMENT ERROR",
      msg: (err && err.message) || String(err),
      client_id,
    });
  }
}
