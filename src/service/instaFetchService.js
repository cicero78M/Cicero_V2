import axios from 'axios';
import pLimit from 'p-limit';
import * as instaPostModel from '../model/instaPostModel.js';
import * as instaLikeModel from '../model/instaLikeModel.js';
import { pool } from '../config/db.js';

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
    `SELECT shortcode FROM insta_post 
     WHERE DATE(created_at) = $1`,
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
    `DELETE FROM insta_post 
     WHERE shortcode = ANY($1) AND DATE(created_at) = $2`,
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

export async function fetchAndStoreInstaContent(keys, waClient, chatId) {
  let processing = true;

  // INFO DEBUG
  console.log("==========[DEBUG: Server Info]==========");
  console.log("Server timezone:", Intl.DateTimeFormat().resolvedOptions().timeZone);
  console.log("Server now:", new Date());
  console.log("=========================================");

  const intervalId = setInterval(() => {
    if (processing) waClient.sendMessage(chatId, '⏳ Processing fetch data...');
  }, 4000);

  const dbShortcodesToday = await getShortcodesToday();
  let fetchedShortcodesToday = [];

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
      // Filter hanya post yang taken_at == hari ini
      if (!isToday(post.taken_at)) continue;

      // INFO DEBUG: Komparasi date
      const takenAtDate = post.taken_at ? new Date(post.taken_at * 1000) : null;
      console.log(
        `[DEBUG] Shortcode: ${post.code}, taken_at: ${post.taken_at}, takenAtDate: ${takenAtDate}, serverNow: ${new Date()}`
      );

      // Siapkan data yang akan di-insert/update
      const toSave = { client_id: client.id };
      keys.forEach(k => {
        if (k === 'caption' && post.caption && typeof post.caption === 'object' && post.caption.text) {
          toSave.caption = post.caption.text;
        } else {
          toSave[k] = post[k];
        }
      });
      toSave.shortcode = post.code;
      toSave.comment_count = post.comment_count ?? 0; // PATCH BARU

      if (!toSave.shortcode) {
        continue;
      }
      fetchedShortcodesToday.push(toSave.shortcode);

      // PATCH: insert/update dengan comment_count dan created_at = taken_at
      await pool.query(
        `INSERT INTO insta_post (client_id, shortcode, caption, comment_count, created_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5))
         ON CONFLICT (shortcode) DO UPDATE
         SET client_id = EXCLUDED.client_id,
             caption = EXCLUDED.caption,
             comment_count = EXCLUDED.comment_count,
             created_at = to_timestamp($5)`,
        [toSave.client_id, toSave.shortcode, toSave.caption || null, toSave.comment_count, post.taken_at]
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

  // Sinkronisasi: hapus yang tidak ada di fetch baru
  const shortcodesToDelete = dbShortcodesToday.filter(x => !fetchedShortcodesToday.includes(x));
  await deleteShortcodes(shortcodesToDelete);

  processing = false;
  clearInterval(intervalId);

  // Ambil dan kirim hanya yang created_at hari ini
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const kontenHariIniRes = await pool.query(
    `SELECT shortcode, created_at FROM insta_post WHERE DATE(created_at) = $1`,
    [`${yyyy}-${mm}-${dd}`]
  );
  kontenHariIniRes.rows.forEach(row => {
    console.log(`[DB] Shortcode: ${row.shortcode}, created_at: ${row.created_at}`);
  });
  const kontenLinks = kontenHariIniRes.rows.map(r => `https://www.instagram.com/p/${r.shortcode}`);

  let maxPerMsg = 30;
  const totalMsg = Math.ceil(kontenLinks.length / maxPerMsg);
  await waClient.sendMessage(chatId, `✅ Fetch selesai!\nJumlah konten hari ini: *${kontenLinks.length}*`);

  for (let i = 0; i < totalMsg; i++) {
    const linksMsg = kontenLinks.slice(i * maxPerMsg, (i + 1) * maxPerMsg).join('\n');
    await waClient.sendMessage(chatId, `Link konten Instagram:\n${linksMsg}`);
  }
}
