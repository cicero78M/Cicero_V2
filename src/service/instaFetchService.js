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

    // --- REQUEST POST (dengan username_or_id_or_url) ---
    const postsRes = await limit(() =>
      axios.get(
        `https://${RAPIDAPI_HOST}/v1/posts`,
        {
          params: { username_or_id_or_url: username },
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST,
          },
        }
      )
    );

    const posts = postsRes.data.data || [];
    for (const post of posts) {
      // Simpan key yang dibutuhkan saja
      const toSave = { client_id: client.id };
      keys.forEach(k => toSave[k] = post[k]);
      await instaPostModel.upsertInstaPost(toSave);

      // --- REQUEST LIKES (dengan code_or_id_or_url = shortcode) ---
      if (post.shortcode) {
        await limit(async () => {
          const likesRes = await axios.get(
            `https://${RAPIDAPI_HOST}/v1/likes`,
            {
              params: { code_or_id_or_url: post.shortcode },
              headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': RAPIDAPI_HOST,
              },
            }
          );
          const likesUsernames = (likesRes.data.data || []).map(like => like.username);
          await instaLikeModel.upsertInstaLike(post.shortcode, likesUsernames);
        });
      }
    }
  }
  return { message: `Sukses ambil & simpan konten ${clients.length} client` };
}
