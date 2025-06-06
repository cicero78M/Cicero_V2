import axios from "axios";
import { pool } from "../../config/db.js";
import { findById, update } from "../../model/clientModel.js";
import { upsertTiktokPosts } from "../../model/tiktokPostModel.js";
import { sendDebug } from "../../middleware/debugHandler.js";
import dotenv from "dotenv";
dotenv.config();

const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "tiktok-api23.p.rapidapi.com";

/**
 * Cek apakah unixTimestamp adalah hari ini (Asia/Jakarta)
 */
function isTodayJakarta(unixTimestamp) {
  if (!unixTimestamp) return false;
  const d = new Date(
    new Date(unixTimestamp * 1000).toLocaleString("en-US", {
      timeZone: "Asia/Jakarta",
    })
  );
  const today = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

/**
 * Dapatkan semua video_id tiktok hari ini dari DB
 */
async function getVideoIdsToday() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const res = await pool.query(
    `SELECT video_id FROM tiktok_post WHERE DATE(created_at) = $1`,
    [`${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map((r) => r.video_id);
}

async function deleteVideoIds(videoIdsToDelete) {
  if (!videoIdsToDelete.length) return;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  await pool.query(
    `DELETE FROM tiktok_post WHERE video_id = ANY($1) AND DATE(created_at) = $2`,
    [videoIdsToDelete, `${yyyy}-${mm}-${dd}`]
  );
}

/**
 * Get all eligible TikTok clients from DB
 */
async function getEligibleTiktokClients() {
  const res = await pool.query(
    `SELECT client_id as id, client_tiktok, tiktok_secuid FROM clients WHERE client_status = true AND client_tiktok IS NOT NULL`
  );
  return res.rows;
}

// Ambil secUid dari DB atau API TikTok
export async function getTiktokSecUid(client) {
  if (client && client.tiktok_secuid) return client.tiktok_secuid;
  if (!client || !client.client_tiktok)
    throw new Error("Username TikTok kosong di database.");
  const username = client.client_tiktok.replace(/^@/, "");
  const url = `https://tiktok-api23.p.rapidapi.com/api/user/info?uniqueId=${encodeURIComponent(
    username
  )}`;
  const headers = {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": RAPIDAPI_HOST,
  };
  const response = await axios.get(url, { headers });
  const data = response.data;
  const secUid = data?.userInfo?.user?.secUid;
  if (!secUid) throw new Error("Gagal fetch secUid dari API.");
  await update(client.id, { tiktok_secuid: secUid });
  return secUid;
}

/**
 * Fungsi utama: fetch & simpan post hari ini SAJA (update jika sudah ada)
 */
export async function fetchAndStoreTiktokContent(
  waClient = null,
  chatId = null
) {
  let processing = true;
  if (!waClient)
    sendDebug({
      tag: "TIKTOK FETCH",
      msg: "fetchAndStoreTiktokContent: mode cronjob/auto",
    });
  else
    sendDebug({
      tag: "TIKTOK FETCH",
      msg: "fetchAndStoreTiktokContent: mode WA handler",
    });

  const intervalId = setInterval(() => {
    if (
      processing &&
      waClient &&
      chatId &&
      typeof waClient.sendMessage === "function"
    ) {
      waClient.sendMessage(chatId, "⏳ Processing fetch TikTok data...");
    }
  }, 4000);

  const dbVideoIdsToday = await getVideoIdsToday();
  let fetchedVideoIdsToday = [];
  let hasSuccessfulFetch = false; // PATCH: flag untuk cek ada fetch sukses

  const clients = await getEligibleTiktokClients();
  sendDebug({
    tag: "TIKTOK FETCH",
    msg: `Eligible clients for TikTok fetch: jumlah client: ${clients.length}`,
  });

  for (const client of clients) {
    let secUid;
    try {
      secUid = await getTiktokSecUid(client);
    } catch (err) {
      sendDebug({
        tag: "TIKTOK FETCH ERROR",
        msg: `Gagal fetch secUid: ${err.message || err}`,
        client_id: client.id,
      });
      continue;
    }

    let postsRes;
    try {
      sendDebug({
        tag: "TIKTOK FETCH",
        msg: `Fetch posts for client: ${client.id} / @${client.client_tiktok}`,
      });
      postsRes = await axios.get(`https://${RAPIDAPI_HOST}/api/user/posts`, {
        params: { secUid, count: 35, cursor: 0 },
        headers: {
          "x-cache-control": "no-cache",
          "X-RapidAPI-Key": RAPIDAPI_KEY,
          "X-RapidAPI-Host": RAPIDAPI_HOST,
        },
      });
      sendDebug({
        tag: "TIKTOK FETCH",
        msg: `API /api/user/posts response: jumlah konten ditemukan: ${
          postsRes.data?.data?.itemList?.length || 0
        }`,
        client_id: client.id,
      });
    } catch (err) {
      sendDebug({
        tag: "TIKTOK POST ERROR",
        msg: err.response?.data
          ? JSON.stringify(err.response.data)
          : err.message,
        client_id: client.id,
      });
      continue;
    }

    // ==== FILTER HANYA KONTEN YANG DI-POST HARI INI (Asia/Jakarta) ====
    const items =
      postsRes.data &&
      postsRes.data.data &&
      Array.isArray(postsRes.data.data.itemList)
        ? postsRes.data.data.itemList.filter((post) =>
            isTodayJakarta(post.createTime)
          )
        : [];
    sendDebug({
      tag: "TIKTOK FETCH",
      msg: `Jumlah post TikTok HARI INI SAJA: ${items.length}`,
      client_id: client.id,
    });

    if (items.length > 0) hasSuccessfulFetch = true; // PATCH

    for (const post of items) {
      const toSave = {
        client_id: client.id,
        video_id: post.id || post.video_id,
        caption: post.desc || post.caption || "",
        // PATCH: Insert as Date (atau ISO string), agar cocok dgn kolom timestamp
        created_at:
          typeof post.createTime === "number"
            ? new Date(post.createTime * 1000)
            : null,
        like_count:
          post.stats?.diggCount ?? post.digg_count ?? post.like_count ?? 0,
        comment_count: post.stats?.commentCount ?? post.comment_count ?? 0,
      };

      fetchedVideoIdsToday.push(toSave.video_id);

      // UPSERT ke DB: update jika sudah ada (berdasarkan video_id)
      sendDebug({
        tag: "TIKTOK FETCH",
        msg: `[DB] Upsert TikTok post: ${toSave.video_id}`,
        client_id: client.id,
      });
      await upsertTiktokPosts(client.id, [toSave]);
      sendDebug({
        tag: "TIKTOK FETCH",
        msg: `[DB] Sukses upsert TikTok post: ${toSave.video_id}`,
        client_id: client.id,
      });
    }
  }

  // PATCH: Hapus hanya jika ada minimal 1 fetch sukses (dan ada minimal 1 post hari ini)
  if (hasSuccessfulFetch) {
    const videoIdsToDelete = dbVideoIdsToday.filter(
      (x) => !fetchedVideoIdsToday.includes(x)
    );
    sendDebug({
      tag: "TIKTOK SYNC",
      msg: `Akan menghapus video_id yang tidak ada hari ini: jumlah=${videoIdsToDelete.length}`,
    });
    await deleteVideoIds(videoIdsToDelete);
  } else {
    sendDebug({
      tag: "TIKTOK SYNC",
      msg: `Tidak ada fetch TikTok berhasil (mungkin API down atau semua kosong), database hari ini tidak dihapus!`,
    });
  }

  processing = false;
  clearInterval(intervalId);

  // Ringkasan WA/console
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const kontenHariIniRes = await pool.query(
    `SELECT video_id, created_at FROM tiktok_post WHERE DATE(created_at) = $1`,
    [`${yyyy}-${mm}-${dd}`]
  );
  const kontenLinksToday = kontenHariIniRes.rows.map(
    (r) => `https://www.tiktok.com/@_/video/${r.video_id}`
  );

  let msg = `✅ Fetch TikTok selesai!\nJumlah konten hari ini: *${kontenLinksToday.length}*`;
  let maxPerMsg = 30;
  const totalMsg = Math.ceil(kontenLinksToday.length / maxPerMsg);

  if (waClient && (chatId || ADMIN_WHATSAPP.length)) {
    const sendTargets = chatId ? [chatId] : ADMIN_WHATSAPP;
    for (const target of sendTargets) {
      await waClient.sendMessage(target, msg);
      for (let i = 0; i < totalMsg; i++) {
        const linksMsg = kontenLinksToday
          .slice(i * maxPerMsg, (i + 1) * maxPerMsg)
          .join("\n");
        await waClient.sendMessage(target, `Link konten TikTok:\n${linksMsg}`);
      }
    }
  } else {
    sendDebug({
      tag: "TIKTOK FETCH",
      msg: msg,
    });
    if (kontenLinksToday.length) {
      sendDebug({
        tag: "TIKTOK FETCH",
        msg: kontenLinksToday.join("\n"),
      });
    }
  }
}
