import fetch from "node-fetch";
import { findById, update } from "../model/clientModel.js";
import { upsertTiktokPosts } from "../model/tiktokPostModel.js";
import { saveTiktokComments } from "../model/tiktokCommentModel.js";
import waClient from "./waService.js"; // pastikan waClient sudah diekspor default
import dotenv from "dotenv";
dotenv.config();

// Helper: Kirim log/debug ke ADMIN WhatsApp
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

// Mendapatkan secUid dari DB, jika tidak ada ambil dari API, lalu update DB
export async function getTiktokSecUid(client_id) {
  const client = await findById(client_id);
  if (client && client.tiktok_secuid) {
    const msg = `[DEBUG] getTiktokSecUid: pakai secUid dari DB untuk ${client_id}: ${client.tiktok_secuid}`;
    console.log(msg);
    sendAdminDebug(msg);
    return client.tiktok_secuid;
  }
  if (!client || !client.client_tiktok) throw new Error("Username TikTok kosong di database.");
  const username = client.client_tiktok.replace(/^@/, "");
  const url = `https://tiktok-api23.p.rapidapi.com/api/user/info?uniqueId=${encodeURIComponent(username)}`;
  const headers = {
    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
    "x-rapidapi-host": "tiktok-api23.p.rapidapi.com"
  };
  const msg1 = `[DEBUG] getTiktokSecUid: fetch secUid dari API untuk ${client_id} / username=${username}`;
  console.log(msg1);
  sendAdminDebug(msg1);

  const res = await fetch(url, { headers });
  const data = await res.json();
  const secUid = data?.userInfo?.user?.secUid;
  if (!secUid) {
    const msgErr = `[ERROR] Gagal fetch secUid dari API untuk ${client_id} / username=${username} -- PAYLOAD: ${JSON.stringify(data)}`;
    console.error(msgErr);
    sendAdminDebug(msgErr);
    throw new Error("Gagal fetch secUid dari API.");
  }
  await update(client_id, { tiktok_secuid: secUid });
  const msg2 = `[DEBUG] getTiktokSecUid: secUid hasil API ${secUid} (sudah diupdate ke DB)`;
  console.log(msg2);
  sendAdminDebug(msg2);
  return secUid;
}

// Fetch semua post hari ini berdasarkan secUid dan simpan ke DB
export async function fetchAndStoreTiktokContent(client_id) {
  try {
    const secUid = await getTiktokSecUid(client_id);
    const url = `https://tiktok-api23.p.rapidapi.com/api/post/user/aweme?secUid=${encodeURIComponent(secUid)}&count=30`;
    const headers = {
      "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      "x-rapidapi-host": "tiktok-api23.p.rapidapi.com"
    };
    const msg1 = `[DEBUG] fetchAndStoreTiktokContent: fetch post TikTok secUid=${secUid} client_id=${client_id}`;
    console.log(msg1);
    sendAdminDebug(msg1);

    const res = await fetch(url, { headers });
    const data = await res.json();
    // Filter post hari ini
    const today = new Date();
    const isToday = (ts) => {
      const d = new Date(ts * 1000);
      return d.toDateString() === today.toDateString();
    };
    const postsToday = (data?.aweme_list || []).filter(post => isToday(post.create_time));
    const msg2 = `[DEBUG] fetchAndStoreTiktokContent: jumlah post hari ini=${postsToday.length}`;
    console.log(msg2);
    sendAdminDebug(msg2);

    // Simpan ke DB
    await upsertTiktokPosts(client_id, postsToday);
    const msg3 = `[DEBUG] fetchAndStoreTiktokContent: sudah simpan ${postsToday.length} post ke DB`;
    console.log(msg3);
    sendAdminDebug(msg3);

    return postsToday.map(post => ({
      video_id: post.aweme_id,
      desc: post.desc,
      digg_count: post.statistics.digg_count,
      unique_id: post.author?.unique_id || "",
      create_time: post.create_time
    }));
  } catch (err) {
    const msgErr = `[ERROR] fetchAndStoreTiktokContent error: ${err.message}`;
    console.error(msgErr);
    sendAdminDebug(msgErr);
    throw err;
  }
}

// Fetch semua komentar untuk satu video_id (paginasi otomatis, simpan ke DB)
export async function fetchAllTikTokCommentsToday(client_id, video_id) {
  try {
    let cursor = 0, allComments = [];
    let page = 1;
    while (true) {
      const url = `https://tiktok-api23.p.rapidapi.com/api/comment/list?aweme_id=${video_id}&cursor=${cursor}&count=50`;
      const headers = {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": "tiktok-api23.p.rapidapi.com"
      };
      const msg1 = `[DEBUG] fetchAllTikTokCommentsToday: fetch komentar page=${page} video_id=${video_id} cursor=${cursor}`;
      console.log(msg1);
      sendAdminDebug(msg1);

      const res = await fetch(url, { headers });
      const data = await res.json();
      if (!data.comments || !Array.isArray(data.comments)) {
        const msgNoData = `[DEBUG] fetchAllTikTokCommentsToday: tidak ada data.comments page=${page}`;
        console.log(msgNoData);
        sendAdminDebug(msgNoData);
        break;
      }
      allComments.push(...data.comments);
      if (!data.has_more || !data.cursor || data.comments.length === 0) {
        const msgFinish = `[DEBUG] fetchAllTikTokCommentsToday: selesai (no more/empty) page=${page}, total komentar=${allComments.length}`;
        console.log(msgFinish);
        sendAdminDebug(msgFinish);
        break;
      }
      cursor = data.cursor;
      page++;
    }
    // Simpan ke DB (array of username, handle map jika objek)
    const commentUsernames = allComments
      .map(c => c.user?.unique_id)
      .filter(Boolean);
    const msg2 = `[DEBUG] fetchAllTikTokCommentsToday: saveTiktokComments untuk video_id=${video_id}, total commenters=${commentUsernames.length}`;
    console.log(msg2);
    sendAdminDebug(msg2);
    await saveTiktokComments(video_id, commentUsernames);
    return commentUsernames;
  } catch (err) {
    const msgErr = `[ERROR] fetchAllTikTokCommentsToday error: ${err.message}`;
    console.error(msgErr);
    sendAdminDebug(msgErr);
    throw err;
  }
}
