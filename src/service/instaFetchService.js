import axios from 'axios';
import pLimit from 'p-limit';
import * as instaPostModel from '../model/instaPostModel.js';
import * as instaLikeModel from '../model/instaLikeModel.js';
import { pool } from '../config/db.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'social-api4.p.rapidapi.com';
const limit = pLimit(4);

async function getShortcodesToday() {
  const res = await pool.query(
    `SELECT shortcode FROM insta_post WHERE DATE(created_at) = CURRENT_DATE`
  );
  return res.rows.map(r => r.shortcode);
}

async function deleteShortcodes(shortcodesToDelete) {
  if (!shortcodesToDelete.length) return;
  await pool.query(
    `DELETE FROM insta_post WHERE shortcode = ANY($1) AND DATE(created_at) = CURRENT_DATE`,
    [shortcodesToDelete]
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

  const intervalId = setInterval(() => {
    if (processing) waClient.sendMessage(chatId, '⏳ Processing fetch data...');
  }, 4000);

  // Dapatkan daftar shortcode yang sudah ada di database hari ini
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
      continue; // next client
    }
    const items = postsRes.data && postsRes.data.data && Array.isArray(postsRes.data.data.items)
      ? postsRes.data.data.items : [];

    for (const post of items) {
      const toSave = { client_id: client.id };
      keys.forEach(k => {
        if (k === 'caption' && post.caption && typeof post.caption === 'object' && post.caption.text) {
          toSave.caption = post.caption.text;
        } else {
          toSave[k] = post[k];
        }
      });
      toSave.shortcode = post.code;
      if (!toSave.shortcode) {
        continue;
      }
      fetchedShortcodesToday.push(toSave.shortcode);

      await instaPostModel.upsertInstaPost(toSave);

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

  // Hanya kirim list konten yang created_at hari ini
  const kontenHariIniRes = await pool.query(
    `SELECT shortcode FROM insta_post WHERE DATE(created_at) = CURRENT_DATE`
  );
  const kontenLinks = kontenHariIniRes.rows.map(r => `https://www.instagram.com/p/${r.shortcode}`);

  let maxPerMsg = 30;
  const totalMsg = Math.ceil(kontenLinks.length / maxPerMsg);
  await waClient.sendMessage(chatId, `✅ Fetch selesai!\nJumlah konten hari ini: *${kontenLinks.length}*`);

  for (let i = 0; i < totalMsg; i++) {
    const linksMsg = kontenLinks.slice(i * maxPerMsg, (i + 1) * maxPerMsg).join('\n');
    await waClient.sendMessage(chatId, `Link konten Instagram:\n${linksMsg}`);
  }
}
