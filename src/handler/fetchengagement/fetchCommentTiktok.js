// src/handler/fetchengagement/fetchCommentTiktok.js

import pLimit from "p-limit";
import { query } from "../../db/index.js";
import { sendDebug } from "../../middleware/debugHandler.js";
import { fetchAllTiktokComments } from "../../service/tiktokApi.js";

const limit = pLimit(3); // atur parallel fetch sesuai kebutuhan

function normalizeClientId(id) {
  return typeof id === "string" ? id.trim().toLowerCase() : id;
}

function normalizeUsername(uname) {
  if (typeof uname !== "string" || uname.length === 0) return null;
  const lower = uname.trim().toLowerCase();
  return lower.startsWith("@") ? lower : `@${lower}`;
}

/**
 * Fetch semua komentar TikTok untuk 1 video_id dari API terbaru
 * Return: array komentar (object asli dari API)
 */

/**
 * Ekstrak & normalisasi username dari array objek komentar TikTok.
 * Diprioritaskan dari: user.unique_id, fallback: username (kalau ada)
 * Return: array string username unik (lowercase, diawali @)
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
    const normalized = normalizeUsername(uname);
    if (normalized) usernames.push(normalized);
  }
  // Unikkan username (no duplicate)
  return [...new Set(usernames)];
}

// Ambil komentar lama (existing) dari DB (username string array)
async function getExistingUsernames(video_id) {
  const res = await query(
    "SELECT comments FROM tiktok_comment WHERE video_id = $1",
    [video_id]
  );
  if (res.rows.length && Array.isArray(res.rows[0].comments)) {
    // pastikan string array
    return res.rows[0].comments
      .map((u) => normalizeUsername(u))
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

  const sql = `
    INSERT INTO tiktok_comment (video_id, comments, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (video_id)
    DO UPDATE SET comments = $2, updated_at = NOW()
  `;
  await query(sql, [video_id, JSON.stringify(finalUsernames)]);
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
    const normalizedId = normalizeClientId(client_id);
    const { rows } = await query(
      `SELECT video_id FROM tiktok_post WHERE LOWER(TRIM(client_id)) = $1 AND DATE(created_at) = $2`,
      [normalizedId, `${yyyy}-${mm}-${dd}`]
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
