import { getUsersByClient } from "../../../model/userModel.js";
import { getPostsTodayByClient } from "../../../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../../../model/tiktokCommentModel.js";

/**
 * Akumulasi minimal 50%: yang sudah komentar >= 50% post hari ini
 */
export async function absensiKomentarTiktokAkumulasi50(client_id, { mode = "all" } = {}) {
  const users = await getUsersByClient(client_id);
  const posts = await getPostsTodayByClient(client_id);
  const totalPost = posts.length;
  if (!totalPost) return `Tidak ada konten TikTok hari ini untuk client ${client_id}.`;

  // Map user_id ke data user
  const userTiktokMap = {};
  const userMeta = {};
  users.forEach(u => {
    if (u.user_id && u.tiktok) {
      userTiktokMap[u.user_id] = (u.tiktok || "").replace(/^@/, "").toLowerCase();
      userMeta[u.user_id] = u;
    }
  });

  const userKomentar = {};
  for (const user_id in userTiktokMap) userKomentar[user_id] = 0;

  for (const post of posts) {
    const video_id = post.video_id || post.id;
    const komentarDb = await getCommentsByVideoId(video_id);
    let komentator = [];
    if (komentarDb && Array.isArray(komentarDb.comments)) {
      komentator = komentarDb.comments.map(c => (c || "").replace(/^@/, "").toLowerCase());
    }
    for (const [user_id, tiktok] of Object.entries(userTiktokMap)) {
      if (komentator.includes(tiktok)) userKomentar[user_id]++;
    }
  }

  const sudah = [], belum = [];
  for (const user_id in userKomentar) {
    const persen = (userKomentar[user_id] / totalPost) * 100;
    const user = userMeta[user_id] || {};
    const label = 
      `- ${user.title ? user.title + " " : ""}${user.nama || user_id} : ` +
      `@${userTiktokMap[user_id] || "-"} (${userKomentar[user_id]}/${totalPost} post, ${Math.round(persen)}%)`;
    if (persen >= 50) sudah.push(label);
    else belum.push(label);
  }

  let msg = 
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Akumulasi Komentar TikTok*\n*Client*: *${client_id}*\n` +
    `Tanggal: ${new Date().toLocaleDateString("id-ID")}\n` +
    `Jam: ${new Date().toLocaleTimeString("id-ID", { hour12: false })}\n\n` +
    `*Jumlah Konten (post):* ${totalPost}\n` +
    `*Jumlah User:* ${users.length}\n\n`;

  // Selalu tampilkan bagian sudah
  msg += `✅ *Sudah melaksanakan (>=50% post)* : *${sudah.length} user*\n`;
  msg += sudah.length ? sudah.join("\n") + "\n\n" : "-\n\n";
  
  // Selalu tampilkan bagian belum
  msg += `❌ *Belum melaksanakan (<50% post)* : *${belum.length} user*\n`;
  msg += belum.length ? belum.join("\n") + "\n\n" : "-\n\n";

  msg += "Terimakasih.";
  return msg.trim();
}

/**
 * Absensi komentar TikTok per konten: siapa yang sudah/belum komentar di tiap post
 */
export async function absensiKomentarTiktokPerKonten(client_id, { mode = "all" } = {}) {
  const users = await getUsersByClient(client_id);
  const userTiktokMap = {};
  const userMeta = {};
  users.forEach(u => {
    if (u.user_id && u.tiktok) {
      userTiktokMap[u.user_id] = (u.tiktok || "").replace(/^@/, "").toLowerCase();
      userMeta[u.user_id] = u;
    }
  });

  const posts = await getPostsTodayByClient(client_id);
  if (!posts.length) return `Tidak ada konten TikTok hari ini untuk client ${client_id}.`;

  let msg = 
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Komentar TikTok Per Konten*\n*Client*: *${client_id}*\n` +
    `Tanggal: ${new Date().toLocaleDateString("id-ID")}\n` +
    `Jam: ${new Date().toLocaleTimeString("id-ID", { hour12: false })}\n` +
    `*Jumlah post:* ${posts.length}\n\n`;

  for (const [i, post] of posts.entries()) {
    const video_id = post.video_id || post.id;
    const komentarDb = await getCommentsByVideoId(video_id);
    let komentator = [];
    if (komentarDb && Array.isArray(komentarDb.comments)) {
      komentator = komentarDb.comments.map(c => (c || "").replace(/^@/, "").toLowerCase());
    }
    let sudah = [], belum = [];
    for (const [user_id, tiktok] of Object.entries(userTiktokMap)) {
      const user = userMeta[user_id] || {};
      const label = `- ${user.title ? user.title + " " : ""}${user.nama || user_id} : @${tiktok}`;
      if (komentator.includes(tiktok)) sudah.push(label);
      else belum.push(label);
    }
    msg += `#${i + 1} Video ID: ${video_id}\n`;
    msg += `   ✅ *Sudah komentar* : ${sudah.length}\n`;
    msg += sudah.length ? sudah.map((u) => "     " + u).join("\n") + "\n" : "     -\n";
    msg += `   ❌ *Belum komentar* : ${belum.length}\n`;
    msg += belum.length ? belum.map((u) => "     " + u).join("\n") + "\n" : "     -\n";
    msg += `   Link: https://www.tiktok.com/@_/video/${video_id}\n\n`;
  }
  msg += "Terimakasih.";
  return msg.trim();
}

// Export untuk dipanggil dari handler manapun (import by name)
