import { getUsersByClient } from "../../../model/userModel.js";
import { getPostsTodayByClient } from "../../../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../../../model/tiktokCommentModel.js";
import { groupByDivision } from "../../../utils/utilsHelper.js";

// Helper normalisasi username tiktok dari komentar (string/object)
function extractTiktokUsername(c) {
  if (typeof c === "object" && c !== null) {
    if (typeof c.username === "string") return c.username.replace(/^@/, "").toLowerCase();
    if (typeof c.user === "string") return c.user.replace(/^@/, "").toLowerCase();
    if (typeof c.user_id === "string") return c.user_id.replace(/^@/, "").toLowerCase();
    return null;
  }
  if (typeof c === "string") return c.replace(/^@/, "").toLowerCase();
  return null;
}

// Helper urut satfung (BAG, SAT, SI, POLSEK)
function sortSatfung(keys) {
  const order = ["BAG", "SAT", "SI", "POLSEK"];
  return keys.sort((a, b) => {
    const ia = order.findIndex((p) => a.toUpperCase().startsWith(p));
    const ib = order.findIndex((p) => b.toUpperCase().startsWith(p));
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// === Akumulasi: minimal 50% post hari ini ===
export async function absensiKomentarTiktokAkumulasi50(client_id, { mode = "all" } = {}) {
  const users = await getUsersByClient(client_id);
  const posts = await getPostsTodayByClient(client_id);
  const totalPost = posts.length;
  if (!totalPost) return `Tidak ada konten TikTok hari ini untuk client ${client_id}.`;

  // Map user_id ke tiktok & user meta
  const userTiktokMap = {};
  const userMeta = {};
  users.forEach(u => {
    if (u.user_id && u.tiktok) {
      userTiktokMap[u.user_id] = (u.tiktok || "").replace(/^@/, "").toLowerCase();
      userMeta[u.user_id] = u;
    }
  });

  // Hitung jumlah komentar user pada semua post
  const userKomentar = {};
  for (const user_id in userTiktokMap) userKomentar[user_id] = 0;
  for (const post of posts) {
    const video_id = post.video_id || post.id;
    const komentarDb = await getCommentsByVideoId(video_id);
    let komentator = [];
    if (komentarDb && Array.isArray(komentarDb.comments)) {
      komentator = komentarDb.comments.map(extractTiktokUsername).filter(Boolean);
    }
    for (const [user_id, tiktok] of Object.entries(userTiktokMap)) {
      if (komentator.includes(tiktok)) userKomentar[user_id]++;
    }
  }

  // Sudah (>=50%) dan belum (<50%)
  let sudah = [], belum = [];
  for (const user_id in userKomentar) {
    const user = userMeta[user_id] || {};
    if (userKomentar[user_id] >= Math.ceil(totalPost / 2)) sudah.push(user);
    else belum.push(user);
  }

  // --- HEADER
  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Akumulasi Komentar TikTok*\n*Client*: *${client_id}*\n` +
    `Tanggal: ${new Date().toLocaleDateString("id-ID")}\n` +
    `Jam: ${new Date().toLocaleTimeString("id-ID", { hour12: false })}\n\n` +
    `*Jumlah Konten (post):* ${totalPost}\n` +
    `*Jumlah User:* ${users.length}\n\n` +
    `✅ *Sudah melaksanakan (>=50% post)* : *${sudah.length} user*\n` +
    `❌ *Belum melaksanakan (<50% post)* : *${belum.length} user*\n\n`;

  // List sesuai mode
  if (mode === "all" || mode === "sudah") {
    msg += `✅ *List Sudah Melaksanakan:*\n`;
    const sudahDiv = groupByDivision(sudah);
    sortSatfung(Object.keys(sudahDiv)).forEach((div) => {
      const list = sudahDiv[div];
      msg += `*${div}* (${list.length} user):\n`;
      msg += list.length
        ? list.map(u =>
            `- ${u.title ? u.title + " " : ""}${u.nama} : @${u.tiktok ? u.tiktok.replace(/^@/, "") : "-"} (${userKomentar[u.user_id]}/${totalPost})`
          ).join("\n") + "\n\n"
        : "-\n\n";
    });
  }
  if (mode === "all" || mode === "belum") {
    msg += `❌ *List Belum Melaksanakan:*\n`;
    const belumDiv = groupByDivision(belum);
    sortSatfung(Object.keys(belumDiv)).forEach((div) => {
      const list = belumDiv[div];
      msg += `*${div}* (${list.length} user):\n`;
      msg += list.length
        ? list.map(u =>
            `- ${u.title ? u.title + " " : ""}${u.nama} : @${u.tiktok ? u.tiktok.replace(/^@/, "") : "-"} (${userKomentar[u.user_id]}/${totalPost})`
          ).join("\n") + "\n\n"
        : "-\n\n";
    });
  }

  msg += `Terimakasih.`;
  return msg.trim();
}

// === PER KONTEN ===
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
      komentator = komentarDb.comments.map(extractTiktokUsername).filter(Boolean);
    }
    let sudah = [], belum = [];
    for (const [user_id, tiktok] of Object.entries(userTiktokMap)) {
      const user = userMeta[user_id] || {};
      if (komentator.includes(tiktok)) sudah.push(user);
      else belum.push(user);
    }

    msg += `#${i + 1} Video ID: ${video_id}\n`;

    if (mode === "all" || mode === "sudah") {
      msg += `   ✅ *Sudah komentar* : ${sudah.length}\n`;
      const sudahDiv = groupByDivision(sudah);
      sortSatfung(Object.keys(sudahDiv)).forEach((div) => {
        const list = sudahDiv[div];
        msg += list.length
          ? `   *${div}* (${list.length} user):\n` +
            list.map(u =>
              `     - ${u.title ? u.title + " " : ""}${u.nama} : @${u.tiktok ? u.tiktok.replace(/^@/, "") : "-"}`
            ).join("\n") + "\n\n"
          : "   -\n\n";
      });
    }
    if (mode === "all" || mode === "belum") {
      msg += `   ❌ *Belum komentar* : ${belum.length}\n`;
      const belumDiv = groupByDivision(belum);
      sortSatfung(Object.keys(belumDiv)).forEach((div) => {
        const list = belumDiv[div];
        msg += list.length
          ? `   *${div}* (${list.length} user):\n` +
            list.map(u =>
              `     - ${u.title ? u.title + " " : ""}${u.nama} : @${u.tiktok ? u.tiktok.replace(/^@/, "") : "-"}`
            ).join("\n") + "\n\n"
          : "   -\n\n";
      });
    }
    msg += `   Link: https://www.tiktok.com/@_/video/${video_id}\n\n`;
  }
  msg += "Terimakasih.";
  return msg.trim();
}
