import axios from 'axios';
import pLimit from 'p-limit';
import { pool } from '../config/db.js';
import * as tiktokCommentModel from '../model/tiktokCommentModel.js';
import { getPostsTodayByClient } from '../model/tiktokPostModel.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';
const limit = pLimit(6);

// Patch: isTodayEpoch, menerima UNIX epoch detik, bandingkan dengan hari WIB
function isTodayEpoch(epoch) {
  if (!epoch) return false;
  const d = new Date(epoch * 1000 + 7 * 60 * 60 * 1000);
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export async function fetchAndStoreTiktokContent(waClient = null, chatId = null, onlyClientId = null) {
  const clients = onlyClientId
    ? (await pool.query(
        `SELECT client_id, client_tiktok, tiktok_secuid FROM clients
         WHERE client_id = $1 AND client_status = true AND client_tiktok_status = true AND client_tiktok IS NOT NULL AND client_tiktok <> ''`,
        [onlyClientId]
      )).rows
    : await (await pool.query(
        `SELECT client_id, client_tiktok, tiktok_secuid FROM clients
         WHERE client_status = true AND client_tiktok_status = true AND client_tiktok IS NOT NULL AND client_tiktok <> ''`
      )).rows;

  let totalKontenHariIni = 0;
  let summaryPerClient = {};
  let ringkasanLines = [];
  let linkListGlobal = [];

  for (const client of clients) {
    let summaryLines = [];
    let linkList = [];
    let kontenHariIni = [];

    summaryLines.push(`[CLIENT] ID: ${client.client_id}, TikTok: ${client.client_tiktok}`);

    // Dapatkan/Update secUid
    let secUid = client.tiktok_secuid;
    if (!secUid || secUid.length < 10) {
      try {
        summaryLines.push(`  [INFO] Fetching secUid for @${client.client_tiktok}`);
        const secUidRes = await axios.get(`https://${RAPIDAPI_HOST}/api/user/info`, {
          params: { unique_id: client.client_tiktok },
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST
          }
        });
        secUid = secUidRes.data?.data?.user?.secUid;
        summaryLines.push(`  [RESULT] secUid found? ${!!secUid}`);
        if (secUid) {
          await pool.query(
            `UPDATE clients SET tiktok_secuid = $1 WHERE client_id = $2`,
            [secUid, client.client_id]
          );
        } else {
          summaryLines.push(`  [SKIP] secUid not found for client_id=${client.client_id}`);
          continue;
        }
      } catch (e) {
        summaryLines.push(`  [SKIP] Error fetching secUid: ${e.message}`);
        continue;
      }
    }

    // Fetch TikTok posts
    let posts = [];
    try {
      summaryLines.push(`  [FETCH] Fetching posts TikTok secUid: ${secUid}`);
      const res = await limit(() =>
        axios.get(`https://${RAPIDAPI_HOST}/api/user/posts`, {
          params: { secUid: secUid, count: 35, cursor: 0 },
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST
          }
        })
      );
      posts = res.data?.data?.itemList || [];
      summaryLines.push(`  [RESULT] Jumlah posts ditemukan: ${posts.length}`);
    } catch (err) {
      summaryLines.push(`[ERROR] Error fetching posts: ${err.message}`);
      continue;
    }

    // Filter post hari ini (WIB)
    for (const post of posts) {
      const postDateEpoch = post.createTime;
      if (!isTodayEpoch(postDateEpoch)) continue;
      kontenHariIni.push(post);
      linkList.push(`https://www.tiktok.com/video/${post.id}`);
    }

    // Upsert post hari ini ke DB dan fetch komentar
    for (const post of kontenHariIni) {
      await pool.query(`
        INSERT INTO tiktok_post (video_id, client_id, caption, created_at, like_count, comment_count)
        VALUES ($1, $2, $3, to_timestamp($4), $5, $6)
        ON CONFLICT (video_id) DO UPDATE SET
          client_id = EXCLUDED.client_id,
          caption = EXCLUDED.caption,
          created_at = EXCLUDED.created_at,
          like_count = EXCLUDED.like_count,
          comment_count = EXCLUDED.comment_count
      `, [
        post.id,
        client.client_id,
        post.desc || '',
        post.createTime,
        post.stats?.diggCount || 0,
        post.stats?.commentCount || 0
      ]);
      // Fetch komentar (langsung upsert)
      let usernames = [];
      try {
        const res = await limit(() =>
          axios.get(`https://${RAPIDAPI_HOST}/api/post/comments`, {
            params: { videoId: post.id, count: 100, cursor: 0 },
            headers: {
              'x-rapidapi-key': RAPIDAPI_KEY,
              'x-rapidapi-host': RAPIDAPI_HOST
            }
          })
        );
        usernames = res.data?.comments?.map(c => c.user?.unique_id).filter(Boolean) || [];
      } catch {}
      await tiktokCommentModel.upsertTiktokComments(post.id, usernames);
    }

    // Format ringkasan model Instagram
    summaryLines.push(`[SUMMARY][${client.client_id}] Tanggal post hari ini (WIB):`);
    kontenHariIni.forEach((post, idx) => {
      const tglWIB = new Date(post.createTime * 1000 + 7 * 60 * 60 * 1000);
      summaryLines.push(
        `  ${idx + 1}. video_id: ${post.id} | ${tglWIB.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`
      );
    });
    summaryLines.push(`[SUMMARY][${client.client_id}] Jumlah konten hari ini: ${kontenHariIni.length}`);
    summaryLines.push(`[SUMMARY][${client.client_id}] Daftar link:`);
    summaryLines = summaryLines.concat(linkList.map(l => `  - ${l}`));

    ringkasanLines.push(summaryLines.join('\n'));
    linkListGlobal = linkListGlobal.concat(linkList);

    // Build untuk return per client
    summaryPerClient[client.client_id] = {
      postsToday: kontenHariIni.map(p => p.id),
      totalHariIni: kontenHariIni.length,
      links: linkList,
      debug: summaryLines.join('\n'),
    };
  }

  // Ringkasan global mirip Instagram fetch
  let globalMsg = [
    `✅ Fetch TikTok selesai!`,
    `Total client: ${clients.length}`,
    `Jumlah total konten hari ini: *${linkListGlobal.length}*`,
    `Daftar link semua konten hari ini:`,
    ...linkListGlobal.map((l, i) => `${i + 1}. ${l}`)
  ].join('\n');

  if (waClient && typeof waClient.sendMessage === 'function' && chatId) {
    await waClient.sendMessage(chatId, globalMsg);
    for (const block of ringkasanLines) {
      await waClient.sendMessage(chatId, block);
    }
  } else {
    console.log(globalMsg);
    console.log(ringkasanLines.join('\n\n'));
  }

  // Return summary per client
  return summaryPerClient;
}
