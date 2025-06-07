// src/handler/fetchEngagement/fetchCommentTiktok.js

import axios from "axios";
import pLimit from "p-limit";
import { pool } from "../../config/db.js";
import { sendDebug } from "../../middleware/debugHandler.js";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "social-api4.p.rapidapi.com";
const limit = pLimit(4); // parallel fetch

async function fetchAllTiktokCommentUsernames(video_id) {
  let allUsernames = [];
  let nextCursor = null;
  let page = 1;
  const maxTry = 20;
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
        msg: `Fetch page gagal: ${e.response?.data ? JSON.stringify(e.response.data) : e.message}`,
        client_id: video_id
      });
      break;
    }
    const items = commentsRes.data?.data?.items || [];
    sendDebug({
      tag: "TTK COMMENT PAGE",
      msg: `Video ${video_id} Page ${page}: ${items.length} komentar`,
      client_id: video_id
    });
    allUsernames.push(...items.map((c) => c.user?.unique_id).filter(Boolean));
    nextCursor = commentsRes.data?.data?.next_cursor || null;
    const hasMore = commentsRes.data?.data?.has_more || (nextCursor && nextCursor !== "");
    if (!hasMore || !nextCursor || page++ >= maxTry) break;
  } while (true);

  const result = [...new Set(allUsernames)];
  sendDebug({
    tag: "TTK COMMENT FINAL",
    msg: `Video ${video_id}: FINAL jumlah username komentar unik: ${result.length}`,
    client_id: video_id
  });
  return result;
}

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

async function upsertTiktokCommentUsernamesMerged(video_id, usernames) {
  const query = `
    INSERT INTO tiktok_comment (video_id, comments, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (video_id)
    DO UPDATE SET comments = EXCLUDED.comments, updated_at = EXCLUDED.updated_at
  `;
  await pool.query(query, [video_id, JSON.stringify(usernames)]);
}

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
          const usernamesToday = await fetchAllTiktokCommentUsernames(video_id);
          const usernamesExisting = await getExistingUsernames(video_id);
          const mergedUsernames = [...new Set([...(usernamesExisting || []), ...usernamesToday])];
          await upsertTiktokCommentUsernamesMerged(video_id, mergedUsernames);
          sukses++;
          sendDebug({
            tag: "TTK COMMENT MERGE",
            msg: `Video ${video_id}: Berhasil simpan/merge komentar (${mergedUsernames.length} username)`,
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
