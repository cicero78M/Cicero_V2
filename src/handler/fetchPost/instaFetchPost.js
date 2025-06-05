// src/handler/fetchPost/instaFetchPost.js

import axios from "axios";
import pLimit from "p-limit";
import { pool } from "../../config/db.js";
import { sendDebug } from "../../middleware/debugHandler.js";

const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "social-api4.p.rapidapi.com";
const limit = pLimit(6);

/**
 * Utility: Cek apakah unixTimestamp adalah hari ini (UTC)
 */
function isToday(unixTimestamp) {
  if (!unixTimestamp) return false;
  const d = new Date(unixTimestamp * 1000);
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

async function getShortcodesToday() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const res = await pool.query(
    `SELECT shortcode FROM insta_post WHERE DATE(created_at) = $1`,
    [`${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map((r) => r.shortcode);
}

async function deleteShortcodes(shortcodesToDelete) {
  if (!shortcodesToDelete.length) return;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  await pool.query(
    `DELETE FROM insta_post WHERE shortcode = ANY($1) AND DATE(created_at) = $2`,
    [shortcodesToDelete, `${yyyy}-${mm}-${dd}`]
  );
}

async function getEligibleClients() {
  const res = await pool.query(
    `SELECT client_ID as id, client_insta FROM clients
      WHERE client_status=true AND client_insta_status=true AND client_insta IS NOT NULL`
  );
  return res.rows;
}

/**
 * Fungsi utama: fetch & simpan post hari ini SAJA (update jika sudah ada)
 */
export async function fetchAndStoreInstaContent(
  keys,
  waClient = null,
  chatId = null
) {
  let processing = true;
  if (!waClient)
    sendDebug({ tag: "IG FETCH", msg: "fetchAndStoreInstaContent: mode cronjob/auto" });
  else
    sendDebug({ tag: "IG FETCH", msg: "fetchAndStoreInstaContent: mode WA handler" });

  const intervalId = setInterval(() => {
    if (
      processing &&
      waClient &&
      chatId &&
      typeof waClient.sendMessage === "function"
    ) {
      waClient.sendMessage(chatId, "⏳ Processing fetch data...");
    }
  }, 4000);

  const dbShortcodesToday = await getShortcodesToday();
  let fetchedShortcodesToday = [];

  const clients = await getEligibleClients();
  sendDebug({
    tag: "IG FETCH",
    msg: `Eligible clients for Instagram fetch: jumlah client: ${clients.length}`
  });

  for (const client of clients) {
    const username = client.client_insta;
    let postsRes;
    try {
      sendDebug({
        tag: "IG FETCH",
        msg: `Fetch posts for client: ${client.id} / @${username}`
      });
      postsRes = await limit(() =>
        axios.get(`https://${RAPIDAPI_HOST}/v1/posts`, {
          params: { username_or_id_or_url: username },
          headers: {
            "x-cache-control": "no-cache",
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST,
          },
        })
      );
      sendDebug({
        tag: "IG FETCH",
        msg: `API /v1/posts response: jumlah konten ditemukan: ${postsRes.data?.data?.items?.length || 0}`,
        client_id: client.id
      });
    } catch (err) {
      sendDebug({
        tag: "IG POST ERROR",
        msg: err.response?.data ? JSON.stringify(err.response.data) : err.message,
        client_id: client.id
      });
      continue;
    }
    // ==== FILTER HANYA KONTEN YANG DI-POST HARI INI ====
    const items =
      postsRes.data &&
      postsRes.data.data &&
      Array.isArray(postsRes.data.data.items)
        ? postsRes.data.data.items.filter((post) => isToday(post.taken_at))
        : [];
    sendDebug({
      tag: "IG FETCH",
      msg: `Jumlah post IG HARI INI SAJA: ${items.length}`,
      client_id: client.id
    });

    for (const post of items) {
      const toSave = {
        client_id: client.id,
        shortcode: post.code,
        comment_count:
          typeof post.comment_count === "number" ? post.comment_count : 0,
        like_count: typeof post.like_count === "number" ? post.like_count : 0,
        caption:
          post.caption && typeof post.caption === "object" && post.caption.text
            ? post.caption.text
            : typeof post.caption === "string"
            ? post.caption
            : null,
      };

      fetchedShortcodesToday.push(toSave.shortcode);

      // UPSERT ke DB: update jika sudah ada (berdasarkan shortcode)
      sendDebug({
        tag: "IG FETCH",
        msg: `[DB] Upsert IG post: ${toSave.shortcode}`,
        client_id: client.id
      });
      await pool.query(
        `INSERT INTO insta_post (client_id, shortcode, caption, comment_count, like_count, created_at)
         VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
         ON CONFLICT (shortcode) DO UPDATE
         SET client_id = EXCLUDED.client_id,
             caption = EXCLUDED.caption,
             comment_count = EXCLUDED.comment_count,
             like_count = EXCLUDED.like_count,
             created_at = to_timestamp($6)`,
        [
          toSave.client_id,
          toSave.shortcode,
          toSave.caption || null,
          toSave.comment_count,
          toSave.like_count,
          post.taken_at,
        ]
      );
      sendDebug({
        tag: "IG FETCH",
        msg: `[DB] Sukses upsert IG post: ${toSave.shortcode}`,
        client_id: client.id
      });
    }
  }

  // Hapus konten hari ini yang sudah tidak ada di hasil fetch hari ini
  const shortcodesToDelete = dbShortcodesToday.filter(
    (x) => !fetchedShortcodesToday.includes(x)
  );
  sendDebug({
    tag: "IG SYNC",
    msg: `Akan menghapus shortcodes yang tidak ada hari ini: jumlah=${shortcodesToDelete.length}`
  });
  await deleteShortcodes(shortcodesToDelete);

  processing = false;
  clearInterval(intervalId);

  // Ringkasan WA/console
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const kontenHariIniRes = await pool.query(
    `SELECT shortcode, created_at FROM insta_post WHERE DATE(created_at) = $1`,
    [`${yyyy}-${mm}-${dd}`]
  );
  const kontenLinksToday = kontenHariIniRes.rows.map(
    (r) => `https://www.instagram.com/p/${r.shortcode}`
  );

  let msg = `✅ Fetch selesai!\nJumlah konten hari ini: *${kontenLinksToday.length}*`;
  let maxPerMsg = 30;
  const totalMsg = Math.ceil(kontenLinksToday.length / maxPerMsg);

  if (waClient && (chatId || ADMIN_WHATSAPP.length)) {
    const sendTargets = chatId ? [chatId] : ADMIN_WHATSAPP;
    for (const target of sendTargets) {
      await waClient.sendMessage(target, msg);
      for (let i = 0; i < totalMsg; i++) {
        const linksMsg = kontenLinksToday
          .slice(i * maxPerMsg, (i + 1) * maxPerMsg)
          .join("\n");
        await waClient.sendMessage(
          target,
          `Link konten Instagram:\n${linksMsg}`
        );
      }
    }
  } else {
    sendDebug({
      tag: "IG FETCH",
      msg: msg
    });
    if (kontenLinksToday.length) {
      sendDebug({
        tag: "IG FETCH",
        msg: kontenLinksToday.join("\n")
      });
    }
  }
}
