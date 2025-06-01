import axios from "axios";
import { findById, update } from "../model/clientModel.js";
import { upsertTiktokPosts } from "../model/tiktokPostModel.js";
import { saveTiktokComments } from "../model/tiktokCommentModel.js";
import waClient from "./waService.js";
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

  const response = await axios.get(url, { headers });
  const data = response.data;
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

// PATCHED: Fetch semua post hari ini berdasarkan secUid dan simpan ke DB
export async function fetchAndStoreTiktokContent(client_id) {
  const secUid = await getTiktokSecUid(client_id);
  const url = `https://tiktok-api23.p.rapidapi.com/api/user/posts`;
  const params = {
    secUid: secUid,
    count: 35,
    cursor: 0
  };
  const headers = {
    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
    "x-rapidapi-host": "tiktok-api23.p.rapidapi.com"
  };

  const msg0 = `[DEBUG] fetchAndStoreTiktokContent: fetch post TikTok secUid=${secUid} client_id=${client_id}`;
  console.log(msg0);
  sendAdminDebug(msg0);

  let response;
  try {
    response = await axios.get(url, { headers, params });
  } catch (err) {
    sendAdminDebug(`[ERROR] Gagal fetch TikTok: ${err.message}`);
    throw err;
  }

  let data = response.data;
  if (!data || (typeof data === "string" && !data.trim())) {
    sendAdminDebug(`[DEBUG] TikTok API response kosong/null untuk client_id=${client_id}`);
    return [];
  }

  // parse jika string
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
      sendAdminDebug(`[DEBUG] TikTok API response.data type string, parse manual OK`);
    } catch (e) {
      sendAdminDebug(`[ERROR] response TikTok tidak bisa di-parse: ${e.message}`);
      return [];
    }
  }

  // DEBUG root payload & keys
  const rootKeys = data && typeof data === "object" ? Object.keys(data) : [];
  const msgPayloadRoot = `[DEBUG] TikTok PAYLOAD ROOT KEYS: ${rootKeys.join(", ")}`;
  console.log(msgPayloadRoot);
  sendAdminDebug(msgPayloadRoot);

  // Deteksi array mana yang isi post
  let postsArr = [];
  let fieldUsed = '';
  if (Array.isArray(data?.itemList) && data.itemList.length) {
    postsArr = data.itemList;
    fieldUsed = 'itemList';
  } else if (Array.isArray(data?.posts) && data.posts.length) {
    postsArr = data.posts;
    fieldUsed = 'posts';
  }
  const msgFieldUsed = `[DEBUG] TikTok POST FIELD USED: ${fieldUsed} (length=${postsArr.length})`;
  console.log(msgFieldUsed);
  sendAdminDebug(msgFieldUsed);

  // Jika benar-benar array konten kosong
  if (Array.isArray(postsArr) && postsArr.length === 0) {
    sendAdminDebug(`[DEBUG] TikTok API mengembalikan array post kosong untuk client_id=${client_id}`);
  }

  // Debug tiap konten, max 10 konten
  postsArr.slice(0, 10).forEach((post, idx) => {
    const tgl = post.createTime ? new Date(post.createTime * 1000).toISOString() : '-';
    const id = post.id || post.video_id || '-';
    sendAdminDebug(`[DEBUG][item ${idx+1}] id=${id} caption=${post.desc || post.caption || ''} createTime=${tgl}`);
  });

  // Filter post hari ini (Asia/Jakarta)
  const todayJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  function isTodayJakarta(ts) {
    const d = new Date(new Date(ts * 1000).toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    return d.getFullYear() === todayJakarta.getFullYear() &&
           d.getMonth() === todayJakarta.getMonth() &&
           d.getDate() === todayJakarta.getDate();
  }
  const postsToday = postsArr.filter(post => isTodayJakarta(post.createTime));
  const msgTgl = `[DEBUG] Tanggal sistem Asia/Jakarta: ${todayJakarta.toISOString()}`;
  console.log(msgTgl);
  sendAdminDebug(msgTgl);

  const msg1 = `[DEBUG] fetchAndStoreTiktokContent: jumlah post hari ini=${postsToday.length}`;
  console.log(msg1);
  sendAdminDebug(msg1);

  if (postsToday.length > 0) {
    await upsertTiktokPosts(client_id, postsToday.map(post => ({
      video_id: post.id,
      caption: post.desc || post.caption || "",
      created_at: new Date(post.createTime * 1000),
      like_count: post.statistics?.diggCount ?? post.statistics?.likeCount ?? post.like_count ?? 0,
      comment_count: post.statistics?.commentCount ?? post.comment_count ?? 0,
    })));
    const msg2 = `[DEBUG] fetchAndStoreTiktokContent: sudah simpan ${postsToday.length} post ke DB`;
    console.log(msg2);
    sendAdminDebug(msg2);
  } else {
    const msg3 = `[DEBUG] fetchAndStoreTiktokContent: tidak ada post hari ini untuk ${client_id}`;
    console.log(msg3);
    sendAdminDebug(msg3);
  }
  return postsToday.map(post => ({
    video_id: post.id,
    caption: post.desc || post.caption || "",
    created_at: new Date(post.createTime * 1000),
    like_count: post.statistics?.diggCount ?? post.statistics?.likeCount ?? post.like_count ?? 0,
    comment_count: post.statistics?.commentCount ?? post.comment_count ?? 0,
  }));
}

// Fetch semua komentar untuk satu video_id (paginasi otomatis, simpan ke DB)
export async function fetchAllTikTokCommentsToday(client_id, video_id) {
  try {
    let cursor = 0, allComments = [];
    let page = 1;
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
          'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com',
          'Content-Type': 'application/json'
        }
      };

      const msg1 = `[DEBUG] fetchAllTikTokCommentsToday: fetch komentar page=${page} video_id=${video_id} cursor=${cursor}`;
      console.log(msg1);
      sendAdminDebug(msg1);

      const response = await axios.request(options);
      const data = response.data;

      if (!data.comments || !Array.isArray(data.comments)) {
        const msgNoData = `[DEBUG] fetchAllTikTokCommentsToday: tidak ada data.comments page=${page}`;
        console.log(msgNoData);
        sendAdminDebug(msgNoData);
        break;
      }
      allComments.push(...data.comments);

      if (!data.has_more || !data.next_cursor || data.comments.length === 0) {
        const msgFinish = `[DEBUG] fetchAllTikTokCommentsToday: selesai (no more/empty) page=${page}, total komentar=${allComments.length}`;
        console.log(msgFinish);
        sendAdminDebug(msgFinish);
        break;
      }
      cursor = data.next_cursor;
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
