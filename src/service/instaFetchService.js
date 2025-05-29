import axios from 'axios';
import pLimit from 'p-limit'; // Tambahan rate limiter
import * as instaPostModel from '../model/instaPostModel.js';
import * as instaLikeModel from '../model/instaLikeModel.js';
import { pool } from '../config/db.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'social-api4.p.rapidapi.com';

// Rate limit: 4 request per detik
const limit = pLimit(4);

async function getEligibleClients() {
  // Update nama table dan kolom sesuai real db Anda!
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

    // Rate limited GET posts
    const postsRes = await limit(() =>
      axios.get(
        `https://${RAPIDAPI_HOST}/instagram/user-posts`,
        {
          params: { username },
          headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': RAPIDAPI_HOST,
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

      // Rate limited GET likes per post
      if (post.shortcode) {
        await limit(async () => {
          const likesRes = await axios.get(
            `https://${RAPIDAPI_HOST}/instagram/post-likes`,
            {
              params: { shortcode: post.shortcode },
              headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': RAPIDAPI_HOST,
              },
            }
          );
          // Simpan hanya array username likes
          const likesUsernames = (likesRes.data.data || []).map(like => like.username);
          await instaLikeModel.upsertInstaLike(post.shortcode, likesUsernames);
        });
      }
    }
  }
  return { message: `Sukses ambil & simpan konten ${clients.length} client` };
}
