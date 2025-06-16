// src/handler/fetchPost/instaFetchPost.js

import pLimit from "p-limit";
import { query } from "../../db/index.js";
import { sendDebug } from "../../middleware/debugHandler.js";
import { fetchInstagramPosts } from "../../service/instagramApi.js";

const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const limit = pLimit(6);

/**
 * Utility: Cek apakah unixTimestamp adalah hari ini (Asia/Jakarta)
 */
function isTodayJakarta(unixTimestamp) {
  if (!unixTimestamp) return false;
  const d = new Date(
    new Date(unixTimestamp * 1000).toLocaleString("en-US", {
      timeZone: "Asia/Jakarta",
    })
  );
  const today = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

async function getShortcodesToday(clientId = null) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  let sql = `SELECT shortcode FROM insta_post WHERE DATE(created_at) = $1`;
  const params = [`${yyyy}-${mm}-${dd}`];
  if (clientId) {
    sql += ` AND client_id = $2`;
    params.push(clientId);
  }
  const res = await query(sql, params);
  return res.rows.map((r) => r.shortcode);
}

async function deleteShortcodes(shortcodesToDelete, clientId = null) {
  if (!shortcodesToDelete.length) return;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  let sql =
    `DELETE FROM insta_post WHERE shortcode = ANY($1) AND DATE(created_at) = $2`;
  const params = [shortcodesToDelete, `${yyyy}-${mm}-${dd}`];
  if (clientId) {
    sql += ` AND client_id = $3`;
    params.push(clientId);
  }
  await query(sql, params);
}

async function getEligibleClients() {
  const res = await query(
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
  chatId = null,
  targetClientId = null
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

  const clients = await getEligibleClients();
  const clientsToFetch = targetClientId
    ? clients.filter((c) => c.id === targetClientId)
    : clients;

  if (targetClientId && clientsToFetch.length === 0) {
    processing = false;
    clearInterval(intervalId);
    throw new Error(`Client ID ${targetClientId} tidak ditemukan atau tidak aktif`);
  }

  const summary = {};

  sendDebug({
    tag: "IG FETCH",
    msg: `Eligible clients for Instagram fetch: jumlah client: ${clientsToFetch.length}`
  });

  for (const client of clientsToFetch) {
    const dbShortcodesToday = await getShortcodesToday(client.id);
    let fetchedShortcodesToday = [];
    let hasSuccessfulFetch = false;
    const username = client.client_insta;
    let postsRes;
    try {
      sendDebug({
        tag: "IG FETCH",
        msg: `Fetch posts for client: ${client.id} / @${username}`
      });
      postsRes = await limit(() => fetchInstagramPosts(username, 50));
      sendDebug({
        tag: "IG FETCH",
        msg: `RapidAPI posts fetched: ${postsRes.length}`,
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
    const items = Array.isArray(postsRes)
      ? postsRes.filter((post) => isTodayJakarta(post.taken_at))
      : [];
    sendDebug({
      tag: "IG FETCH",
      msg: `Jumlah post IG HARI INI SAJA: ${items.length}`,
      client_id: client.id
    });
    if (items.length > 0) hasSuccessfulFetch = true;

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
      await query(
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

    // Hapus konten hari ini yang sudah tidak ada di hasil fetch hari ini
    const shortcodesToDelete = dbShortcodesToday.filter(
      (x) => !fetchedShortcodesToday.includes(x)
    );

    if (hasSuccessfulFetch) {
      sendDebug({
        tag: "IG SYNC",
        msg: `Akan menghapus shortcodes yang tidak ada hari ini: jumlah=${shortcodesToDelete.length}`,
        client_id: client.id
      });
      await deleteShortcodes(shortcodesToDelete, client.id);
    } else {
      sendDebug({
        tag: "IG SYNC",
        msg: `Tidak ada fetch IG berhasil untuk client ${client.id}, database tidak dihapus`,
        client_id: client.id
      });
    }

    // Hitung jumlah konten hari ini untuk summary
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
      const countRes = await query(
        `SELECT shortcode FROM insta_post WHERE client_id = $1 AND DATE(created_at) = $2`,
        [client.id, `${yyyy}-${mm}-${dd}`]
      );
    summary[client.id] = { count: countRes.rows.length };
  }

  processing = false;
  clearInterval(intervalId);

  // Ringkasan WA/console
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
    const kontenHariIniRes = await query(
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
  return summary;
}
