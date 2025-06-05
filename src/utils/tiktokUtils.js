import dotenv from "dotenv";
dotenv.config();

import { pool } from "../config/db.js";

export async function getActiveClientsTiktok() {
  const res = await pool.query(
    `SELECT client_id FROM clients WHERE client_status = true AND client_tiktok IS NOT NULL`
  );
  return res.rows.map((row) => row.client_id);
}

export async function getClientTiktokUsername(client_id) {
  try {
    const q = `SELECT client_tiktok FROM clients WHERE client_id = $1 LIMIT 1`;
    const result = await pool.query(q, [client_id]);
    if (result.rows[0] && result.rows[0].client_tiktok)
      return result.rows[0].client_tiktok.replace(/^@/, "");
  } catch (e) {}
  return "-";
}


export async function rekapKomentarTikTok(client_id, client_tiktok) {
  const posts = await getPostsTodayByClient(client_id);
  if (!posts.length) return null;

  let totalKomentar = 0;
  let detailKomentar = [];
  for (const post of posts) {
    const video_id = post.video_id || post.id;
    let komentarDb = await getCommentsByVideoId(video_id);
    let jumlahKomentar = 0;
    if (komentarDb && Array.isArray(komentarDb.comments)) {
      jumlahKomentar = komentarDb.comments.length;
    }
    totalKomentar += jumlahKomentar;
    detailKomentar.push({
      video_id,
      link: `https://www.tiktok.com/@${client_tiktok}/video/${video_id}`,
      jumlahKomentar,
    });
  }
  let msg =
    `📊 Rekap Komentar TikTok\n` +
    `Client: ${client_id}\n` +
    `Jumlah konten hari ini: ${posts.length}\n` +
    `Total komentar semua konten: ${totalKomentar}\n\n` +
    `Rincian:\n`;
  detailKomentar.forEach((d) => {
    msg += `${d.link}: ${d.jumlahKomentar} komentar\n`;
  });
  return msg.trim();
}

export function formatRekapPostTikTok(client_id, username, posts) {
  let msg = `*Rekap Post TikTok Hari Ini*\nClient: *${client_id}*\n\n`;
  msg += `Jumlah post: *${posts.length}*\n\n`;
  posts.forEach((item, i) => {
    const desc = item.desc || item.caption || "-";
    let create_time =
      item.create_time || item.created_at || item.createTime;
    let created = "-";
    if (typeof create_time === "number") {
      if (create_time > 2000000000) {
        created = new Date(create_time).toLocaleString("id-ID", {
          timeZone: "Asia/Jakarta",
        });
      } else {
        created = new Date(create_time * 1000).toLocaleString("id-ID", {
          timeZone: "Asia/Jakarta",
        });
      }
    } else if (typeof create_time === "string") {
      created = new Date(create_time).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      });
    } else if (create_time instanceof Date) {
      created = create_time.toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      });
    }
    const video_id = item.video_id || item.id;
    msg += `#${i + 1} Video ID: ${video_id}\n`;
    msg += `   Deskripsi: ${desc.slice(0, 50)}\n`;
    msg += `   Tanggal: ${created}\n`;
    msg += `   Like: ${item.digg_count ?? item.like_count ?? 0} | Komentar: ${item.comment_count ?? 0}\n`;
    msg += `   Link: https://www.tiktok.com/@${username}/video/${video_id}\n\n`;
  });
  return msg.trim();
}