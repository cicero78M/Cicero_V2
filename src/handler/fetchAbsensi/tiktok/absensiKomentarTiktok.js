import { getUsersByClient } from "../../../model/userModel.js";
import { getPostsTodayByClient } from "../../../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../../../model/tiktokCommentModel.js";
import { groupByDivision } from "../../../utils/utilsHelper.js";

// Helper: urutan satfung tetap
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

// Helper normalisasi username komentar (string/object)
function extractTiktokUsername(c) {
  if (typeof c === "object" && c !== null)
    return (c.username || c.user || "").replace(/^@/, "").toLowerCase();
  if (typeof c === "string")
    return c.replace(/^@/, "").toLowerCase();
  return "";
}

/**
 * Absensi komentar TikTok: akumulasi minimal 50% post hari ini
 * Mode: all (default), sudah, belum
 */
export async function absensiKomentarTiktokAkumulasi50(client_id, { mode = "all" } = {}) {
  const users = await getUsersByClient(client_id);
  const posts = await getPostsTodayByClient(client_id);
  const totalPost = posts.length;
  if (!totalPost) return `Tidak ada konten TikTok hari ini untuk client ${client_id}.`;

  // Map user_id ke data user dan username
  const userTiktokMap = {};
  const userMeta = {};
  users.forEach(u => {
    if (u.user_id && u.tiktok) {
      userTiktokMap[u.user_id] = (u.tiktok || "").replace(/^@/, "").toLowerCase();
      userMeta[u.user_id] = u;
    }
  });

  // Hitung jumlah komentar per user
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

  // Group user: sudah (>=50%), belum (<50%)
  let sudah = [], belum = [];
  Object.keys(userKomentar).forEach(user_id => {
    const u = userMeta[user_id] || {};
    if (u.exception === true) {
      sudah.push({ ...u, count: totalPost });
    } else if (userKomentar[user_id] >= Math.ceil(totalPost / 2)) {
      sudah.push({ ...u, count: userKomentar[user_id] });
    } else {
      belum.push({ ...u, count: userKomentar[user_id] });
    }
  });

  // Hapus user exception dari belum
  belum = belum.filter(u => !u.exception);

  // --- Format laporan ---
  const now = new Date();
  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Akumulasi Komentar TikTok*\n*Client*: *${client_id}*\n` +
    `Tanggal: ${now.toLocaleDateString("id-ID")}\n` +
    `Jam: ${now.toLocaleTimeString("id-ID", { hour12: false })}\n\n` +
    `*Jumlah Konten (post):* ${totalPost}\n` +
    `*Jumlah User:* ${users.length}\n` +
    `✅ *Sudah melaksanakan (>=50% post)* : *${sudah.length} user*\n` +
    `❌ *Belum melaksanakan (<50% post)* : *${belum.length} user*\n\n`;

  // --- List data user sesuai mode ---
  if (mode === "all" || mode === "sudah") {
    msg += `✅ *Sudah melaksanakan*\n`;
    if (sudah.length > 0) {
      const sudahDiv = groupByDivision(sudah);
      sortSatfung(Object.keys(sudahDiv)).forEach((div, i, arr) => {
        const list = sudahDiv[div];
        msg += `*${div}* (${list.length} user):\n`;
        msg += list
          .map(u =>
            `- ${u.title ? u.title + " " : ""}${u.nama || u.user_id} : @${u.tiktok} (${u.count}/${totalPost} post)`
          )
          .join("\n") + (i < arr.length - 1 ? "\n" : "");
      });
    } else {
      msg += "-";
    }
    msg += "\n\n";
  }
  if (mode === "all" || mode === "belum") {
    msg += `❌ *Belum melaksanakan*\n`;
    if (belum.length > 0) {
      const belumDiv = groupByDivision(belum);
      sortSatfung(Object.keys(belumDiv)).forEach((div, i, arr) => {
        const list = belumDiv[div];
        msg += `*${div}* (${list.length} user):\n`;
        msg += list
          .map(u =>
            `- ${u.title ? u.title + " " : ""}${u.nama || u.user_id} : @${u.tiktok || "-"} (${u.count}/${totalPost} post)`
          )
          .join("\n") + (i < arr.length - 1 ? "\n" : "");
      });
    } else {
      msg += "-";
    }
    msg += "\n\n";
  }

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
      komentator = komentarDb.comments.map(extractTiktokUsername).filter(Boolean);
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
    msg += sudah.length ? sudah.map((u) => "     " + u).join("\n") : "     -";
    msg += "\n";
    msg += `   ❌ *Belum komentar* : ${belum.length}\n`;
    msg += belum.length ? belum.map((u) => "     " + u).join("\n") : "     -";
    msg += `\n   Link: https://www.tiktok.com/@_/video/${video_id}\n\n`;
  }
  msg += "Terimakasih.";
  return msg.trim();
}
