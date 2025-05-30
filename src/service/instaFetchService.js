import axios from 'axios';
import pLimit from 'p-limit';
import * as instaPostModel from '../model/instaPostModel.js';
import * as instaLikeModel from '../model/instaLikeModel.js';
import { pool } from '../config/db.js';

// Ambil ADMIN_WHATSAPP dari .env (bisa berupa string koma, array, dsb)
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

export async function fetchAndStoreInstaContent(keys, waClient = null, chatId = null) {
  let processing = true;

  // DEBUG info
  if (!waClient) console.log("[DEBUG] fetchAndStoreInstaContent: mode cronjob/auto");
  else console.log("[DEBUG] fetchAndStoreInstaContent: mode WA handler");

  // Progress WA (hanya jika waClient & chatId valid)
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
  for (const client of clients) {
    const username = client.client_insta;
    let postsRes;
    try {
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
    } catch (err) {
      console.error("ERROR FETCHING POST:", err.response?.data || err.message);
      continue;
    }
    const items = postsRes.data && postsRes.data.data && Array.isArray(postsRes.data.data.items)
      ? postsRes.data.data.items : [];

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

      // INSERT/UPDATE dengan kolom baru
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

      // Likes merge
      if (post.code) {
        await limit(async () => {
          const likesRes = await axios.get(
            `https://${RAPIDAPI_HOST}/v1/likes`,
            {
              params: { code_or_id_or_url: post.code },
              headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': RAPIDAPI_HOST,
              },
            }
          );
          const likeItems = likesRes.data && likesRes.data.data && Array.isArray(likesRes.data.data.items)
            ? likesRes.data.data.items : [];
          let likesUsernames = likeItems.map(like => like.username ? like.username : like);
          const dbLike = await instaLikeModel.getLikeUsernamesByShortcode(post.code);
          if (dbLike) {
            likesUsernames = [...new Set([...dbLike, ...likesUsernames])];
          }
          await instaLikeModel.upsertInstaLike(post.code, likesUsernames);
        });
      }
    }
  }

  // Sinkronisasi: hapus yg tidak ada di fetch baru
  const shortcodesToDelete = dbShortcodesToday.filter(x => !fetchedShortcodesToday.includes(x));
  await deleteShortcodes(shortcodesToDelete);

  processing = false;
  clearInterval(intervalId);

  // Ambil hasil link hari ini
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
    // Manual: kirim ke chatId jika ada, jika tidak ke semua admin
    const sendTargets = chatId ? [chatId] : ADMIN_WHATSAPP;
    for (const target of sendTargets) {
      await waClient.sendMessage(target, msg);
      for (let i = 0; i < totalMsg; i++) {
        const linksMsg = kontenLinksToday.slice(i * maxPerMsg, (i + 1) * maxPerMsg).join('\n');
        await waClient.sendMessage(target, `Link konten Instagram:\n${linksMsg}`);
      }
    }
  } else {
    // Mode non-WA
    console.log(msg);
    if (kontenLinksToday.length) {
      console.log(kontenLinksToday.join('\n'));
    }
  }
}
