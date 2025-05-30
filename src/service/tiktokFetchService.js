import axios from 'axios';
import pLimit from 'p-limit';
import * as tiktokPostModel from '../model/tiktokPostModel.js';
import * as tiktokLikeModel from '../model/tiktokLikeModel.js';
import { pool } from '../config/db.js';

const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'social-api4.p.rapidapi.com';
const limit = pLimit(4);

function isToday(unixTimestamp) {
  if (!unixTimestamp) return false;
  const d = new Date(unixTimestamp * 1000);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
}

// Model functions mirip insta
async function getVideoIdsToday() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const res = await pool.query(
    `SELECT video_id FROM tiktok_post WHERE DATE(created_at) = $1`,
    [`${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map(r => r.video_id);
}

async function deleteVideoIds(videoIdsToDelete) {
  if (!videoIdsToDelete.length) return;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  await pool.query(
    `DELETE FROM tiktok_post WHERE video_id = ANY($1) AND DATE(created_at) = $2`,
    [videoIdsToDelete, `${yyyy}-${mm}-${dd}`]
  );
}

async function getEligibleClients() {
  const res = await pool.query(
    `SELECT client_ID as id, client_tiktok FROM clients
      WHERE client_status=true AND client_tiktok_status=true AND client_tiktok IS NOT NULL`
  );
  return res.rows;
}

// PATCH: fetch all likes TikTok via pagination (cursor)
async function fetchAllTiktokLikes(video_id) {
  let allLikes = [];
  let nextCursor = null;
  let page = 1;
  const maxTry = 20;
  do {
    let params = { video_id_or_url: video_id }; // ganti param sesuai API TikTok likes
    if (nextCursor) params.cursor = nextCursor;

    let likesRes;
    try {
      likesRes = await axios.get(
        `https://${RAPIDAPI_HOST}/v1/tiktok/likes`, // ganti sesuai endpoint likes TikTok
        {
          params,
          headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': RAPIDAPI_HOST,
          },
        }
      );
    } catch (e) {
      console.error(`[ERROR][FETCH TIKTOK LIKES PAGE][${video_id}]`, e.response?.data || e.message);
      break;
    }

    // Debug response page (jumlah likes dalam 1 halaman)
    const likeItems = likesRes.data?.data?.items || [];
    console.log(`[DEBUG][LIKES PAGE][${video_id}] Page ${page}: jumlah usernames halaman ini: ${likeItems.length}`);
    allLikes.push(...likeItems.map(like => like.username ? like.username : like).filter(Boolean));

    nextCursor = likesRes.data?.data?.next_cursor || likesRes.data?.data?.end_cursor || null;
    const hasMore = likesRes.data?.data?.has_more || (nextCursor && nextCursor !== '');

    console.log(`[DEBUG][LIKES PAGING][${video_id}] Fetched so far: ${allLikes.length} | next_cursor: ${nextCursor}`);
    if (!hasMore || !nextCursor || page++ >= maxTry) break;
  } while (true);

  const result = [...new Set(allLikes)];
  console.log(`[DEBUG][LIKES PAGING][${video_id}] FINAL UNIQUE COUNT: ${result.length}`);
  return result;
}

// === CRON TIKTOK FINAL ===
export async function fetchAndStoreTiktokContent(keys, waClient = null, chatId = null) {
  let processing = true;

  if (!waClient) console.log("[DEBUG] fetchAndStoreTiktokContent: mode cronjob/auto");
  else console.log("[DEBUG] fetchAndStoreTiktokContent: mode WA handler");

  const intervalId = setInterval(() => {
    if (
      processing &&
      waClient &&
      chatId &&
      typeof waClient.sendMessage === 'function'
    ) {
      waClient.sendMessage(chatId, '⏳ Processing fetch data TikTok...');
    }
  }, 4000);

  const dbVideoIdsToday = await getVideoIdsToday();
  let fetchedVideoIdsToday = [];
  let kontenLinks = [];
  let kontenCount = 0;

  const clients = await getEligibleClients();
  console.log(`[DEBUG] Eligible clients for TikTok fetch:`, clients);

  for (const client of clients) {
    const username = client.client_tiktok;
    let postsRes;
    try {
      console.log(`[DEBUG] Fetch posts for client: ${client.id} / @${username}`);
      postsRes = await limit(() =>
        axios.get(
          `https://${RAPIDAPI_HOST}/v1/tiktok/posts`, // endpoint TikTok posts
          {
            params: { username_or_id_or_url: username },
            headers: {
              'X-RapidAPI-Key': RAPIDAPI_KEY,
              'X-RapidAPI-Host': RAPIDAPI_HOST,
            },
          }
        )
      );
      console.log(`[DEBUG] TikTok /v1/tiktok/posts response (first 500 chars):`, JSON.stringify(postsRes.data).substring(0, 500));
    } catch (err) {
      console.error("[ERROR][FETCH TIKTOK POST]", err.response?.data || err.message);
      continue;
    }
    const items = postsRes.data && postsRes.data.data && Array.isArray(postsRes.data.data.items)
      ? postsRes.data.data.items : [];
    console.log(`[DEBUG] Jumlah post TikTok yang ditemukan hari ini:`, items.length);

    for (const post of items) {
      if (!isToday(post.create_time)) continue; // TikTok field create_time unix seconds

      const toSave = {
        client_id: client.id,
        video_id: post.video_id,
        caption: post.desc || null,
        comment_count: typeof post.comment_count === "number" ? post.comment_count : 0,
        like_count: typeof post.digg_count === "number" ? post.digg_count : 0,
        created_at: post.create_time
      };

      fetchedVideoIdsToday.push(toSave.video_id);
      kontenCount++;
      kontenLinks.push(`https://www.tiktok.com/@${username}/video/${toSave.video_id}`);

      // INSERT/UPDATE ke tiktok_post
      console.log(`[DEBUG][DB] Upsert TikTok post ke tiktok_post:`, toSave);
      await pool.query(
        `INSERT INTO tiktok_post (client_id, video_id, caption, comment_count, like_count, created_at)
         VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
         ON CONFLICT (video_id) DO UPDATE
         SET client_id = EXCLUDED.client_id,
             caption = EXCLUDED.caption,
             comment_count = EXCLUDED.comment_count,
             like_count = EXCLUDED.like_count,
             created_at = to_timestamp($6)`,
        [
          toSave.client_id,
          toSave.video_id,
          toSave.caption || null,
          toSave.comment_count,
          toSave.like_count,
          toSave.created_at
        ]
      );
      console.log(`[DEBUG][DB] Sukses upsert TikTok post:`, toSave.video_id);

      // Likes merge via paginasi
      if (post.video_id) {
        await limit(async () => {
          let likesUsernames = await fetchAllTiktokLikes(post.video_id);
          const reportedLikeCount = (typeof post.digg_count === 'number') ? post.digg_count : null;
          console.log(`[DEBUG][LIKES COUNT] Video ${post.video_id}: like_count (API post): ${reportedLikeCount} | likesUsernames.length: ${likesUsernames.length}`);
          if (reportedLikeCount !== null && Math.abs(likesUsernames.length - reportedLikeCount) > 0) {
            console.warn(`[WARNING][LIKES MISMATCH] Video ${post.video_id}: Jumlah username likes dari API (${likesUsernames.length}) TIDAK SAMA dengan like_count post (${reportedLikeCount})`);
          }
          // DB LIKE: tampilkan hanya jumlah data likes, tidak tampilkan isinya
          const dbLike = await tiktokLikeModel.getLikeUsernamesByVideoId(post.video_id);
          if (dbLike) {
            console.log(`[DEBUG][DB LIKE] Likes di DB sebelum merge (${post.video_id}): jumlah=${dbLike.length}`);
            likesUsernames = [...new Set([...dbLike, ...likesUsernames])];
          }
          console.log(`[DEBUG][DB LIKE] Likes setelah merge untuk ${post.video_id}: jumlah=${likesUsernames.length}`);
          await tiktokLikeModel.upsertTiktokLike(post.video_id, likesUsernames);
          console.log(`[DEBUG][DB] Sukses upsert likes TikTok:`, post.video_id, '| Total:', likesUsernames.length);
        });
      }
    }
  }

  // Sinkronisasi
  const videoIdsToDelete = dbVideoIdsToday.filter(x => !fetchedVideoIdsToday.includes(x));
  console.log(`[DEBUG][SYNC] Akan menghapus video_ids yang tidak ada hari ini:`, videoIdsToDelete.length);
  await deleteVideoIds(videoIdsToDelete);

  processing = false;
  clearInterval(intervalId);

  // Ambil hasil link hari ini
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const kontenHariIniRes = await pool.query(
    `SELECT video_id, created_at FROM tiktok_post WHERE DATE(created_at) = $1`,
    [`${yyyy}-${mm}-${dd}`]
  );
  const kontenLinksToday = kontenHariIniRes.rows.map(r => `https://www.tiktok.com/video/${r.video_id}`);

  let msg = `✅ Fetch TikTok selesai!\nJumlah konten hari ini: *${kontenLinksToday.length}*`;
  let maxPerMsg = 30;
  const totalMsg = Math.ceil(kontenLinksToday.length / maxPerMsg);

  // Mode WA
  if (waClient && (chatId || ADMIN_WHATSAPP.length)) {
    const sendTargets = chatId ? [chatId] : ADMIN_WHATSAPP;
    for (const target of sendTargets) {
      await waClient.sendMessage(target, msg);
      for (let i = 0; i < totalMsg; i++) {
        const linksMsg = kontenLinksToday.slice(i * maxPerMsg, (i + 1) * maxPerMsg).join('\n');
        await waClient.sendMessage(target, `Link konten TikTok:\n${linksMsg}`);
      }
    }
  } else {
    console.log(msg);
    if (kontenLinksToday.length) {
      console.log(kontenLinksToday.join('\n'));
    }
  }
}
