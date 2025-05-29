import axios from 'axios';
import pLimit from 'p-limit';
import * as instaPostModel from '../model/instaPostModel.js';
import * as instaLikeModel from '../model/instaLikeModel.js';
import { pool } from '../config/db.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'social-api4.p.rapidapi.com';

// Rate limit: 4 request per detik
const limit = pLimit(4);

async function getEligibleClients() {
  const res = await pool.query(
    `SELECT client_ID as id, client_insta FROM clients
      WHERE client_status=true AND client_insta_status=true AND client_insta IS NOT NULL`
  );
  return res.rows;
}

// Fungsi utama, sekarang menerima waClient & chatId untuk progress update
export async function fetchAndStoreInstaContent(keys, waClient, chatId) {
  let processing = true;
  let kontenCount = 0;
  let kontenLinks = [];

  // Progress message: setiap 4 detik
  const intervalId = setInterval(() => {
    if (processing) waClient.sendMessage(chatId, '⏳ Processing fetch data...');
  }, 4000);

  const clients = await getEligibleClients();
  for (const client of clients) {
    const username = client.client_insta;
    const postsRes = await limit(() =>
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
    const items = postsRes.data && postsRes.data.data && Array.isArray(postsRes.data.data.items)
      ? postsRes.data.data.items : [];

    for (const post of items) {
      const toSave = { client_id: client.id };
      keys.forEach(k => {
        // Hanya ambil text dari caption
        if (k === 'caption' && post.caption && typeof post.caption === 'object' && post.caption.text) {
          toSave.caption = post.caption.text;
        } else {
          toSave[k] = post[k];
        }
      });
      toSave.shortcode = post.code;
      if (!toSave.shortcode) {
        console.warn('SKIP: post tanpa code/shortcode', post);
        continue;
      }
      await instaPostModel.upsertInstaPost(toSave);

      // Push link ke list
      kontenCount++;
      kontenLinks.push(`https://www.instagram.com/p/${toSave.shortcode}`);

      // Fetch likes
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
          const likesUsernames = likeItems.map(like => like.username ? like.username : like);
          await instaLikeModel.upsertInstaLike(post.code, likesUsernames);
        });
      }
    }
  }

  processing = false;
  clearInterval(intervalId);

  // Kirim hasil akhir ke WhatsApp
  let maxPerMsg = 30; // max link per message biar tidak terlalu panjang
  const totalMsg = Math.ceil(kontenLinks.length / maxPerMsg);
  await waClient.sendMessage(chatId, `✅ Fetch selesai!\nJumlah konten berhasil diambil: *${kontenLinks.length}*`);

  for (let i = 0; i < totalMsg; i++) {
    const linksMsg = kontenLinks.slice(i * maxPerMsg, (i + 1) * maxPerMsg).join('\n');
    await waClient.sendMessage(chatId, `Link konten Instagram:\n${linksMsg}`);
  }
}
