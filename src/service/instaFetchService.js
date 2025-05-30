import axios from 'axios';
import pLimit from 'p-limit';
import * as instaLikeModel from '../model/instaLikeModel.js';
import { pool } from '../config/db.js';

const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'social-api4.p.rapidapi.com';
const limit = pLimit(6);

function isToday(unixTimestamp) {
  if (!unixTimestamp) return false;
  const d = new Date(unixTimestamp * 1000);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
}

async function getShortcodesToday() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const res = await pool.query(
    `SELECT shortcode FROM insta_post WHERE DATE(created_at) = $1`,
    [`${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map(r => r.shortcode);
}

async function deleteShortcodes(shortcodesToDelete) {
  if (!shortcodesToDelete.length) return;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  await pool.query(
    `DELETE FROM insta_post WHERE shortcode = ANY($1) AND DATE(created_at) = $2`,
    [shortcodesToDelete, `${yyyy}-${mm}-${dd}`]
  );
}

async function getEligibleClients() {
  const res = await pool.query(
    `SELECT client_ID as id, client_insta FROM clients
      WHERE client_status=true AND client_insta_status=true AND client_insta IS NOT NULL`
  );
  return res.rows;
}

// PATCH: fetch all likes via pagination (cursor), debug hanya jumlah
async function fetchAllLikes(shortcode) {
  let allLikes = [];
  let nextCursor = null;
  let page = 1;
  const maxTry = 20;
  do {
    let params = { code_or_id_or_url: shortcode };
    if (nextCursor) params.cursor = nextCursor;

    let likesRes;
    try {
      likesRes = await axios.get(
        `https://${RAPIDAPI_HOST}/v1/likes`,
        {
          params,
          headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': RAPIDAPI_HOST,
          },
        }
      );
    } catch (e) {
      console.error(`[ERROR][FETCH IG LIKES PAGE][${shortcode}]`, e.response?.data || e.message);
      break;
    }

    // Debug jumlah likes di page ini
    const likeItems = likesRes.data?.data?.items || [];
    console.log(`[DEBUG][LIKES PAGE][${shortcode}] Page ${page}: ${likeItems.length} username dihalaman ini`);

    allLikes.push(...likeItems.map(like => like.username ? like.username : like).filter(Boolean));

    nextCursor = likesRes.data?.data?.next_cursor || likesRes.data?.data?.end_cursor || null;
    const hasMore = likesRes.data?.data?.has_more || (nextCursor && nextCursor !== '');

    // Debug progress jumlah total so far
    console.log(`[DEBUG][LIKES PAGING][${shortcode}] Total fetched sementara: ${allLikes.length} | next_cursor: ${!!nextCursor}`);

    if (!hasMore || !nextCursor || page++ >= maxTry) break;
  } while (true);

  const result = [...new Set(allLikes)];
  console.log(`[DEBUG][LIKES PAGING][${shortcode}] FINAL jumlah unique: ${result.length}`);
  return result;
}

// PATCH FINAL: semua debug hanya jumlah data (angka)
export async function fetchAndStoreInstaContent(keys, waClient = null, chatId = null) {
  let processing = true;

  if (!waClient) console.log("[DEBUG] fetchAndStoreInstaContent: mode cronjob/auto");
  else console.log("[DEBUG] fetchAndStoreInstaContent: mode WA handler");

  const intervalId = setInterval(() => {
    if (
      processing &&
      waClient &&
      chatId &&
      typeof waClient.sendMessage === 'function'
    ) {
      waClient.sendMessage(chatId, '⏳ Processing fetch data...');
    }
  }, 4000);

  const dbShortcodesToday = await getShortcodesToday();
  let fetchedShortcodesToday = [];
  let kontenLinks = [];
  let kontenCount = 0;

  const clients = await getEligibleClients();
  console.log(`[DEBUG] Eligible clients for Instagram fetch: jumlah client: ${clients.length}`);

  for (const client of clients) {
    const username = client.client_insta;
    let postsRes;
    try {
      console.log(`[DEBUG] Fetch posts for client: ${client.id} / @${username}`);
      postsRes = await limit(() =>
        axios.get(
          `https://${RAPIDAPI_HOST}/v1/posts`,
          {
            params: { username_or_id_or_url: username },
            headers: {
              'X-RapidAPI-Key': RAPIDAPI_KEY,
              'X-RapidAPI-Host': RAPIDAPI_HOST,
            },
          }
        )
      );
      console.log(`[DEBUG] API /v1/posts response: jumlah konten ditemukan: ${postsRes.data?.data?.items?.length || 0}`);
    } catch (err) {
      console.error("[ERROR][FETCH IG POST]", err.response?.data || err.message);
      continue;
    }
    const items = postsRes.data && postsRes.data.data && Array.isArray(postsRes.data.data.items)
      ? postsRes.data.data.items : [];
    console.log(`[DEBUG] Jumlah post IG hari ini:`, items.length);

    for (const post of items) {
      if (!isToday(post.taken_at)) continue;

      const toSave = {
        client_id: client.id,
        shortcode: post.code,
        comment_count: typeof post.comment_count === "number" ? post.comment_count : 0,
        like_count: typeof post.like_count === "number" ? post.like_count : 0,
        caption: (post.caption && typeof post.caption === 'object' && post.caption.text)
          ? post.caption.text
          : (typeof post.caption === 'string' ? post.caption : null)
      };

      fetchedShortcodesToday.push(toSave.shortcode);
      kontenCount++;
      kontenLinks.push(`https://www.instagram.com/p/${toSave.shortcode}`);

      // INSERT/UPDATE
      console.log(`[DEBUG][DB] Upsert IG post: ${toSave.shortcode}`);
      await pool.query(
        `INSERT INTO insta_post (client_id, shortcode, caption, comment_count, like_count, created_at)
         VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
         ON CONFLICT (shortcode) DO UPDATE
         SET client_id = EXCLUDED.client_id,
             caption = EXCLUDED.caption,
             comment_count = EXCLUDED.comment_count,
             like_count = EXCLUDED.like_count,
             created_at = to_timestamp($6)`,
        [
          toSave.client_id,
          toSave.shortcode,
          toSave.caption || null,
          toSave.comment_count,
          toSave.like_count,
          post.taken_at
        ]
      );
      console.log(`[DEBUG][DB] Sukses upsert IG post: ${toSave.shortcode}`);

      // Likes merge
      if (post.code) {
        await limit(async () => {
          let likesUsernames = await fetchAllLikes(post.code);

          // Jumlah likes: API vs username hasil fetch
          const reportedLikeCount = (typeof post.like_count === 'number') ? post.like_count : null;
          console.log(`[DEBUG][LIKES COUNT] Post ${post.code}: like_count (API post): ${reportedLikeCount} | likesUsernames.length: ${likesUsernames.length}`);
          if (reportedLikeCount !== null && Math.abs(likesUsernames.length - reportedLikeCount) > 0) {
            console.warn(`[WARNING][LIKES MISMATCH] Post ${post.code}: Jumlah likes API: ${reportedLikeCount}, username hasil fetch: ${likesUsernames.length}`);
          }

          // DB LIKE: hanya jumlah
          const dbLike = await instaLikeModel.getLikeUsernamesByShortcode(post.code);
          if (dbLike) {
            console.log(`[DEBUG][DB LIKE] Likes di DB sebelum merge (${post.code}): jumlah=${dbLike.length}`);
            likesUsernames = [...new Set([...dbLike, ...likesUsernames])];
          }
          console.log(`[DEBUG][DB LIKE] Likes setelah merge untuk ${post.code}: jumlah=${likesUsernames.length}`);

          await instaLikeModel.upsertInstaLike(post.code, likesUsernames);
          console.log(`[DEBUG][DB] Sukses upsert likes IG: ${post.code} | Total likes disimpan: ${likesUsernames.length}`);
        });
      }
    }
  }

  // Sinkronisasi: hapus yg tidak ada di fetch baru
  const shortcodesToDelete = dbShortcodesToday.filter(x => !fetchedShortcodesToday.includes(x));
  console.log(`[DEBUG][SYNC] Akan menghapus shortcodes yang tidak ada hari ini: jumlah=${shortcodesToDelete.length}`);
  await deleteShortcodes(shortcodesToDelete);

  processing = false;
  clearInterval(intervalId);

  // Ringkasan fetch
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const kontenHariIniRes = await pool.query(
    `SELECT shortcode, created_at FROM insta_post WHERE DATE(created_at) = $1`,
    [`${yyyy}-${mm}-${dd}`]
  );
  const kontenLinksToday = kontenHariIniRes.rows.map(r => `https://www.instagram.com/p/${r.shortcode}`);

  let msg = `✅ Fetch selesai!\nJumlah konten hari ini: *${kontenLinksToday.length}*`;
  let maxPerMsg = 30;
  const totalMsg = Math.ceil(kontenLinksToday.length / maxPerMsg);

  // Mode WA
  if (waClient && (chatId || ADMIN_WHATSAPP.length)) {
    const sendTargets = chatId ? [chatId] : ADMIN_WHATSAPP;
    for (const target of sendTargets) {
      await waClient.sendMessage(target, msg);
      for (let i = 0; i < totalMsg; i++) {
        const linksMsg = kontenLinksToday.slice(i * maxPerMsg, (i + 1) * maxPerMsg).join('\n');
        await waClient.sendMessage(target, `Link konten Instagram:\n${linksMsg}`);
      }
    }
  } else {
    console.log(msg);
    if (kontenLinksToday.length) {
      console.log(kontenLinksToday.join('\n'));
    }
  }
}
