// src/service/instaFetchService.js
import axios from 'axios';
import * as instaPostModel from '../model/instaPostModel.js';
import * as instaLikeModel from '../model/instaLikeModel.js';
import { pool } from '../config/db.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'social-api4.p.rapidapi.com';

async function getEligibleClients() {
  const res = await pool.query(
    `SELECT id, client_insta FROM client
      WHERE client_status=true AND client_insta_status=true AND client_insta IS NOT NULL`
  );
  return res.rows;
}

export async function fetchAndStoreInstaContent(keys) {
  const clients = await getEligibleClients();
  for (const client of clients) {
    const username = client.client_insta;
    // Fetch posts
    const postsRes = await axios.get(
      `https://${RAPIDAPI_HOST}/instagram/user-posts`,
      {
        params: { username },
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
        },
      }
    );
    const posts = postsRes.data.data || [];
    for (const post of posts) {
      // Hanya simpan key yg dibutuhkan
      const toSave = { client_id: client.id };
      keys.forEach(k => toSave[k] = post[k]);
      await instaPostModel.upsertInstaPost(toSave);
      // Fetch likes per post
      if (post.shortcode) {
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
        await instaLikeModel.upsertInstaLike(post.shortcode, likesRes.data.data || []);
      }
    }
  }
  return { message: `Sukses ambil & simpan konten ${clients.length} client` };
}
