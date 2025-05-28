// src/service/instagramService.js

import pool from '../config/db.js';

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
