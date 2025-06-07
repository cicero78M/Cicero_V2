import { getUsersByClient } from "../../model/userModel.js";
import { getPostsTodayByClient } from "../../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../../model/tiktokCommentModel.js";

/**
 * Akumulasi minimal 50%: yang sudah komentar >= 50% post hari ini
 */
export async function absensiKomentarTiktokAkumulasi50(client_id, { mode = "all" } = {}) {
  const users = await getUsersByClient(client_id);
  const posts = await getPostsTodayByClient(client_id);
  const totalPost = posts.length;
  if (!totalPost) return `Tidak ada konten TikTok hari ini untuk client ${client_id}.`;

  // Buat map: user_id -> username tiktok
  const userTiktokMap = {};
  users.forEach(u => {
    if (u.user_id && u.tiktok) userTiktokMap[u.user_id] = (u.tiktok || "").replace(/^@/, "").toLowerCase();
  });

  // Buat: user_id -> set komentar hari ini
  const userKomentar = {};
  for (const user_id in userTiktokMap) userKomentar[user_id] = 0;
  for (const post of posts) {
    const video_id = post.video_id || post.id;
    let komentarDb = await getCommentsByVideoId(video_id);
    let komentator = [];
    if (komentarDb && Array.isArray(komentarDb.comments)) {
      komentator = komentarDb.comments.map((c) => (c || "").replace(/^@/, "").toLowerCase());
    }
    for (const [user_id, tiktok] of Object.entries(userTiktokMap)) {
      if (komentator.includes(tiktok)) userKomentar[user_id]++;
    }
  }

  let sudah = [], belum = [];
  for (const user_id in userKomentar) {
    const persentase = (userKomentar[user_id] / totalPost) * 100;
    const label = `${user_id} (@${userTiktokMap[user_id] || "-"}) [${userKomentar[user_id]}/${totalPost} = ${Math.round(persentase)}%]`;
    if (persentase >= 50) sudah.push(label);
    else belum.push(label);
  }

  let msg = `📊 *Absensi Komentar TikTok - Akumulasi Minimal 50%*\nClient: *${client_id}*\nTotal post: *${totalPost}*\n\n`;
  if (["all", "sudah"].includes(mode)) {
    msg += `✅ Sudah komentar minimal 50%: ${sudah.length}\n${sudah.map(u => "- " + u).join("\n")}\n\n`;
  }
  if (["all", "belum"].includes(mode)) {
    msg += `❌ Belum (kurang dari 50% post): ${belum.length}\n${belum.map(u => "- " + u).join("\n")}\n\n`;
  }
  return msg.trim();
}

/**
 * Absensi komentar TikTok per konten: siapa yang sudah/belum komentar di tiap post
 */
export async function absensiKomentarTiktokPerKonten(client_id, { mode = "all" } = {}) {
  const users = await getUsersByClient(client_id);
  const userTiktokMap = {};
  users.forEach(u => {
    if (u.user_id && u.tiktok) userTiktokMap[u.user_id] = (u.tiktok || "").replace(/^@/, "").toLowerCase();
  });

  const posts = await getPostsTodayByClient(client_id);
  if (!posts.length) return `Tidak ada konten TikTok hari ini untuk client ${client_id}.`;

  let msg = `📊 *Absensi Komentar TikTok Per Konten*\nClient: *${client_id}*\nJumlah post: *${posts.length}*\n\n`;

  for (const [i, post] of posts.entries()) {
    const video_id = post.video_id || post.id;
    let komentarDb = await getCommentsByVideoId(video_id);
    let komentator = [];
    if (komentarDb && Array.isArray(komentarDb.comments)) {
      komentator = komentarDb.comments.map((c) => (c || "").replace(/^@/, "").toLowerCase());
    }
    let sudah = [], belum = [];
    for (const [user_id, tiktok] of Object.entries(userTiktokMap)) {
      if (komentator.includes(tiktok)) sudah.push(user_id + " (@" + tiktok + ")");
      else belum.push(user_id + " (@" + tiktok + ")");
    }
    msg += `#${i + 1} Video ID: ${video_id}\n`;
    if (["all", "sudah"].includes(mode)) {
      msg += `   ✅ Sudah komentar: ${sudah.length}\n`;
      if (mode !== "belum") msg += sudah.map((u) => "     - " + u).join("\n") + "\n";
    }
    if (["all", "belum"].includes(mode)) {
      msg += `   ❌ Belum komentar: ${belum.length}\n`;
      if (mode !== "sudah") msg += belum.map((u) => "     - " + u).join("\n") + "\n";
    }
    msg += `   Link: https://www.tiktok.com/@_/video/${video_id}\n\n`;
  }
  return msg.trim();
}
