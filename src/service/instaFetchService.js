import axios from 'axios';
import pLimit from 'p-limit';
import * as instaPostModel from '../model/instaPostModel.js';
import * as instaLikeModel from '../model/instaLikeModel.js';
import { pool } from '../config/db.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'social-api4.p.rapidapi.com';

// Rate limit: 4 request per detik
const limit = pLimit(15);

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  return d.getFullYear() === today.getFullYear()
    && d.getMonth() === today.getMonth()
    && d.getDate() === today.getDate();
}

async function getEligibleClients() {
  const res = await pool.query(
    `SELECT client_ID as id, client_insta FROM clients
      WHERE client_status=true AND client_insta_status=true AND client_insta IS NOT NULL`
  );
  return res.rows;
}

// Ambil semua shortcode pada database hari ini
async function getShortcodesToday() {
  // Pastikan field tanggal pada DB anda, misal timestamp
  const res = await pool.query(
    `SELECT shortcode FROM insta_post WHERE DATE(created_at) = CURRENT_DATE`
  );
  return res.rows.map(r => r.shortcode);
}

// Hapus semua shortcode pada database hari ini yang tidak ada di list
async function deleteShortcodes(shortcodesToDelete) {
  if (!shortcodesToDelete.length) return;
  await pool.query(
    `DELETE FROM insta_post WHERE shortcode = ANY($1) AND DATE(created_at) = CURRENT_DATE`,
    [shortcodesToDelete]
  );
}

export async function fetchAndStoreInstaContent(keys, waClient, chatId) {
  let processing = true;
  let kontenCount = 0;
  let kontenLinks = [];

  // Progress message: setiap 4 detik
  const intervalId = setInterval(() => {
    if (processing) waClient.sendMessage(chatId, '⏳ Processing fetch data...');
  }, 4000);

  // Ambil semua shortcode database hari ini (sebelum fetch)
  const dbShortcodesToday = await getShortcodesToday();
  // Untuk tracking hasil fetch hari ini
  let fetchedShortcodesToday = [];

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
    // Filter hanya yang tanggalnya hari ini (field timestamp)
    if (!isToday(post.timestamp)) continue;

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
        console.warn('SKIP: post tanpa code/shortcode', post);
        continue;
    }
    fetchedShortcodesToday.push(toSave.shortcode);

    await instaPostModel.upsertInstaPost(toSave);

    // List link
    kontenCount++;
    kontenLinks.push(`https://www.instagram.com/p/${toSave.shortcode}`);

    // Fetch likes - PATCHED
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
        // Likes baru dari API
        const likeItems = likesRes.data && likesRes.data.data && Array.isArray(likesRes.data.data.items)
            ? likesRes.data.data.items : [];
        const newUsernames = likeItems.map(like => like.username ? like.username : like);

        // Likes lama dari database
        let oldUsernames = [];
        try {
            oldUsernames = await instaLikeModel.getLikeUsernamesByShortcode(post.code);
        } catch (e) {
            oldUsernames = [];
        }

        // Gabungkan tanpa duplikat
        const allUsernamesSet = new Set([...oldUsernames, ...newUsernames]);
        const allUsernames = Array.from(allUsernamesSet);

        // Simpan likes gabungan ke database
        await instaLikeModel.upsertInstaLike(post.code, allUsernames);
        });
    }
    }

  }

  // Setelah fetch selesai, hapus shortcode database hari ini yang tidak ada di hasil fetch
  const shortcodesToDelete = dbShortcodesToday.filter(x => !fetchedShortcodesToday.includes(x));
  await deleteShortcodes(shortcodesToDelete);

  processing = false;
  clearInterval(intervalId);

  // Kirim hasil akhir ke WhatsApp
  let maxPerMsg = 30; // max link per message
  const totalMsg = Math.ceil(kontenLinks.length / maxPerMsg);
  await waClient.sendMessage(chatId, `✅ Fetch selesai!\nJumlah konten hari ini: *${kontenLinks.length}*`);

  for (let i = 0; i < totalMsg; i++) {
    const linksMsg = kontenLinks.slice(i * maxPerMsg, (i + 1) * maxPerMsg).join('\n');
    await waClient.sendMessage(chatId, `Link konten Instagram:\n${linksMsg}`);
  }
}
