import axios from "axios";
import { findById, update } from "../model/clientModel.js";
import { upsertTiktokPosts } from "../model/tiktokPostModel.js";
import { sendAdminDebug } from "../middleware/debugHandler.js";
import dotenv from "dotenv";
dotenv.config();

// Ambil secUid dari DB atau API TikTok
export async function getTiktokSecUid(client_id) {
  const client = await findById(client_id);
  if (client && client.tiktok_secuid) return client.tiktok_secuid;
  if (!client || !client.client_tiktok)
    throw new Error("Username TikTok kosong di database.");
  const username = client.client_tiktok.replace(/^@/, "");
  const url = `https://tiktok-api23.p.rapidapi.com/api/user/info?uniqueId=${encodeURIComponent(
    username
  )}`;
  const headers = {
    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
    "x-rapidapi-host": "tiktok-api23.p.rapidapi.com",
  };
  const response = await axios.get(url, { headers });
  const data = response.data;
  const secUid = data?.userInfo?.user?.secUid;
  if (!secUid) throw new Error("Gagal fetch secUid dari API.");
  await update(client_id, { tiktok_secuid: secUid });
  return secUid;
}

// PATCH FINAL: Fetch semua post TikTok hari ini, mapping waktu ke created_at (epoch)
export async function fetchAndStoreTiktokContent(client_id) {
  const secUid = await getTiktokSecUid(client_id);
  const url = `https://tiktok-api23.p.rapidapi.com/api/user/posts`;
  const params = {
    secUid: secUid,
    count: 35,
    cursor: 0,
  };
  const headers = {
    "x-cache-control": "no-cache",
    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
    "x-rapidapi-host": "tiktok-api23.p.rapidapi.com",
  };

  const response = await axios.get(url, { headers, params });
  let data = response.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = {};
    }
  }

  // PATCH: Pastikan path data.itemList sesuai hasil fetch API asli
  const postsArr = Array.isArray(data?.data?.itemList)
    ? data.data.itemList
    : [];
  sendAdminDebug(
    `[DEBUG] TikTok POST COUNT (data.itemList): ${postsArr.length}`
  );

  // Filter hanya post hari ini (Asia/Jakarta)
  const todayJakarta = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );
  function isTodayJakarta(ts) {
    if (!ts || isNaN(ts)) return false;
    const d = new Date(
      new Date(ts * 1000).toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
    );
    return (
      d.getFullYear() === todayJakarta.getFullYear() &&
      d.getMonth() === todayJakarta.getMonth() &&
      d.getDate() === todayJakarta.getDate()
    );
  }
  const postsToday = postsArr.filter((post) => isTodayJakarta(post.createTime));

  sendAdminDebug(
    `[DEBUG] fetchAndStoreTiktokContent: jumlah post hari ini=${postsToday.length}`
  );

  // Simpan ke DB
  if (postsToday.length > 0) {
    await upsertTiktokPosts(
      client_id,
      postsToday.map((post) => {
        const createdEpoch =
          typeof post.createTime === "number" ? post.createTime : null;
        return {
          video_id: post.id || post.video_id,
          caption: post.desc || post.caption || "",
          created_at: createdEpoch, // gunakan format number (epoch detik)
          like_count:
            post.stats?.diggCount ?? post.digg_count ?? post.like_count ?? 0,
          comment_count: post.stats?.commentCount ?? post.comment_count ?? 0,
        };
      })
    );
    sendAdminDebug(
      `[DEBUG] fetchAndStoreTiktokContent: sudah simpan ${postsToday.length} post ke DB`
    );
  } else {
    sendAdminDebug(
      `[DEBUG] fetchAndStoreTiktokContent: tidak ada post hari ini untuk ${client_id}`
    );
  }

  // Return array posts
  return postsToday.map((post) => {
    const createdEpoch =
      typeof post.createTime === "number" ? post.createTime : null;
    return {
      video_id: post.id || post.video_id,
      caption: post.desc || post.caption || "",
      created_at: createdEpoch,
      like_count:
        post.stats?.diggCount ?? post.digg_count ?? post.like_count ?? 0,
      comment_count: post.stats?.commentCount ?? post.comment_count ?? 0,
    };
  });
}
