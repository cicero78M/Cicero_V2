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

export async function fetchAndStoreInstaContent(keys) {
  const clients = await getEligibleClients();
  for (const client of clients) {
    const username = client.client_insta;

    // Request ke API: endpoint /v1/posts
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

    // Array post ada di data.data.items
    const items = postsRes.data && postsRes.data.data && Array.isArray(postsRes.data.data.items)
      ? postsRes.data.data.items : [];

    for (const post of items) {
      // Patch: selalu isi 'shortcode' dengan value 'code'
      const toSave = { client_id: client.id };
      keys.forEach(k => toSave[k] = post[k]);
      // Wajib field 'shortcode' diisi dari post.code
      toSave.shortcode = post.code;
      if (!toSave.shortcode) {
        // Jika tetap tidak ada, skip
        console.warn('SKIP: post tanpa code/shortcode', post);
        continue;
      }
      await instaPostModel.upsertInstaPost(toSave);

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
          // Array username like ada di data.data.items
          const likeItems = likesRes.data && likesRes.data.data && Array.isArray(likesRes.data.data.items)
            ? likesRes.data.data.items : [];
          // Kalau likes berupa array objek { username: ... }
          const likesUsernames = likeItems.map(like => like.username ? like.username : like);
          await instaLikeModel.upsertInstaLike(post.code, likesUsernames);
        });
      }
    }
  }
  return { message: `Sukses ambil & simpan konten ${clients.length} client` };
}
