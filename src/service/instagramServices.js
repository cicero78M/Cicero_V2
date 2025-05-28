// src/service/instagramService.js

import pool from '../config/db.js';
import https from 'https';

/**
 * Simpan atau perbarui postingan Instagram ke database.
 * Jika postingan sudah ada, perbarui datanya.
 * Jika postingan tidak ada, tambahkan sebagai entri baru.
 * Jika ada entri di database yang tidak ada di data baru, hapus entri tersebut.
 *
 * @param {string} clientId - ID klien.
 * @param {Array} posts - Array objek postingan Instagram.
 */
export async function savePosts(clientId, posts) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ambil semua kode postingan yang sudah ada untuk klien ini
    const res = await client.query(
      'SELECT code FROM instagram_posts WHERE client_id = $1',
      [clientId]
    );
    const existingCodes = res.rows.map(row => row.code);

    // Kode postingan dari data baru
    const newCodes = posts.map(post => post.code);

    // Tentukan kode yang perlu dihapus (ada di DB tapi tidak di data baru)
    const codesToDelete = existingCodes.filter(code => !newCodes.includes(code));

    // Hapus entri yang tidak ada di data baru
    if (codesToDelete.length > 0) {
      await client.query(
        'DELETE FROM instagram_posts WHERE client_id = $1 AND code = ANY($2)',
        [clientId, codesToDelete]
      );
    }

    // Masukkan atau perbarui data postingan
    for (const post of posts) {
      await client.query(
        `INSERT INTO instagram_posts (
          client_id,
          code,
          created_at,
          likes,
          comments,
          caption,
          content_type,
          thumbnail_url,
          image_url,
          video_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (client_id, code) DO UPDATE SET
          created_at = EXCLUDED.created_at,
          likes = EXCLUDED.likes,
          comments = EXCLUDED.comments,
          caption = EXCLUDED.caption,
          content_type = EXCLUDED.content_type,
          thumbnail_url = EXCLUDED.thumbnail_url,
          image_url = EXCLUDED.image_url,
          video_url = EXCLUDED.video_url;`,
        [
          clientId,
          post.code,
          post.created_at,
          post.likes,
          post.comments,
          post.caption,
          post.content_type,
          post.thumbnail_url,
          post.image_url,
          post.video_url
        ]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving Instagram posts:', error);
  } finally {
    client.release();
  }
}

/**
 * Ambil postingan Instagram via RapidAPI berdasarkan username.
 * Hanya ambil postingan hari ini (maksimal 12).
 * @param {string} username - Username Instagram
 * @returns {Promise<Array>} Array postingan Instagram
 */
export function fetchInstagramPosts(username) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      hostname: 'social-api4.p.rapidapi.com',
      port: null,
      path: `/v1/posts?username_or_id_or_url=${username}`,
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'social-api4.p.rapidapi.com'
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];

      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          // Filter postingan hari ini, ambil max 12
          const today = new Date().toISOString().slice(0, 10);
          const posts = (data?.posts || []).filter(post =>
            post.created && post.created.startsWith(today)
          ).slice(0, 12).map(post => ({
            code: post.code,
            created_at: post.created,
            likes: post.likes,
            comments: post.comments,
            caption: post.caption,
            content_type: post.is_video ? 'video' : 'image',
            thumbnail_url: post.thumbnail_url,
            image_url: post.image_url,
            video_url: post.is_video ? post.video_url : null
          }));
          resolve(posts);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', err => reject(err));
    req.end();
  });
}
