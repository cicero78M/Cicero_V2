import { query } from "../../../db/index.js";
import { getUsersByClient, getUsersByDirektorat } from "../../../model/userModel.js";
import { getPostsTodayByClient } from "../../../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../../../model/tiktokCommentModel.js";
import { hariIndo } from "../../../utils/constants.js";
import { groupByDivision, sortDivisionKeys } from "../../../utils/utilsHelper.js";
import { sendDebug } from "../../../middleware/debugHandler.js";

// Dapatkan nama dan username tiktok client
async function getClientInfo(client_id) {
  const res = await query(
    "SELECT nama, client_tiktok, client_type FROM clients WHERE LOWER(client_id) = LOWER($1) LIMIT 1",
    [client_id]
  );
  return {
    nama: res.rows[0]?.nama || client_id,
    tiktok: (res.rows[0]?.client_tiktok || "").replace(/^@/, "") || "username",
    clientType: res.rows[0]?.client_type || null,
  };
}

// Helper ekstrak username dari komentar
function extractUsernamesFromComments(comments) {
  return (comments || [])
    .map((x) => {
      let uname = "";
      if (typeof x === "string") {
        uname = x;
      } else if (x && typeof x.username === "string") {
        uname = x.username;
      } else if (x && x.user && typeof x.user.unique_id === "string") {
        uname = x.user.unique_id;
      }
      return uname.toLowerCase().replace(/^@/, "");
    })
    .filter(Boolean);
}

// === AKUMULASI (min 50%) ===
export async function absensiKomentar(client_id, opts = {}) {
  const { clientFilter } = opts;
  const roleFlag = opts.roleFlag;
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const clientInfo = await getClientInfo(client_id);
  const clientNama = clientInfo.nama;
  const tiktokUsername = clientInfo.tiktok;
  const clientType = clientInfo.clientType;
  const allowedRoles = ["ditbinmas", "ditlantas", "bidhumas"];
  let users;
  if (
    roleFlag &&
    allowedRoles.includes(roleFlag.toLowerCase()) &&
    roleFlag.toUpperCase() === client_id.toUpperCase()
  ) {
    users = (
      await getUsersByDirektorat(roleFlag.toLowerCase(), clientFilter || client_id)
    ).filter((u) => u.status === true);
  } else {
    users = await getUsersByClient(clientFilter || client_id, roleFlag);
  }
  const posts = await getPostsTodayByClient(client_id);

  sendDebug({
    tag: "ABSEN TTK",
    msg: `Start per-konten absensi. Posts=${posts.length} users=${users.length}`,
    client_id,
  });

  sendDebug({
    tag: "ABSEN TTK",
    msg: `Start absensi komentar. Posts=${posts.length} users=${users.length}`,
    client_id,
  });

  if (!posts.length)
    return `Tidak ada konten TikTok untuk *Polres*: *${clientNama}* hari ini.`;

  const userStats = {};
  users.forEach((u) => {
    userStats[u.user_id] = { ...u, count: 0 };
  });

  for (const post of posts) {
    const { comments } = await getCommentsByVideoId(post.video_id);
    const commentSet = new Set(extractUsernamesFromComments(comments));
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Post ${post.video_id} comments=${commentSet.size}`,
      client_id,
    });
    users.forEach((u) => {
      if (
        u.tiktok &&
        u.tiktok.trim() !== "" &&
        commentSet.has(u.tiktok.replace(/^@/, "").toLowerCase())
      ) {
        userStats[u.user_id].count += 1;
      }
    });
  }

  const totalKonten = posts.length;

  if (clientType === "direktorat") {
    const groups = {};
    Object.values(userStats).forEach((u) => {
      const cid = u.client_id?.toUpperCase() || "";
      if (!groups[cid]) groups[cid] = { total: 0, updated: 0, noUsername: 0 };
      groups[cid].total++;
      if (u.exception === true) {
        groups[cid].updated++;
      } else if (!u.tiktok || u.tiktok.trim() === "") {
        groups[cid].noUsername++;
      } else if (u.count >= Math.ceil(totalKonten / 2)) {
        groups[cid].updated++;
      }
    });
    const kontenLinks = posts.map(
      (p) => `https://www.tiktok.com/@${tiktokUsername}/video/${p.video_id}`
    );
    const reports = await Promise.all(
      Object.keys(groups).map(async (cid) => {
        const { nama } = await getClientInfo(cid);
        const g = groups[cid];
        const belum = g.total - g.updated - g.noUsername;
        return (
          `*Polres*: *${nama}*\n` +
          `*Jumlah user:* ${g.total}\n` +
          `✅ *Sudah melaksanakan* : *${g.updated} user*\n` +
          `❌ *Belum melaksanakan* : *${belum} user*\n` +
          `⚠️ *Belum input username* : *${g.noUsername} user*`
        );
      })
    );
    let msg =
      `Mohon ijin Komandan,\n\n` +
      `📋 *Rekap Akumulasi Komentar TikTok*\n*Direktorat*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
      `*Jumlah Konten:* ${totalKonten}\n` +
      `*Daftar Link Konten:*\n${kontenLinks.length ? kontenLinks.join("\n") : "-"}\n\n` +
      reports.join("\n\n") +
      `\n\nTerimakasih.`;
    return msg.trim();
  }

  let sudah = [], belum = [];

  Object.values(userStats).forEach((u) => {
    if (u.exception === true) {
      sudah.push(u);
    } else if (
      u.tiktok &&
      u.tiktok.trim() !== "" &&
      u.count >= Math.ceil(totalKonten / 2)
    ) {
      sudah.push(u);
    } else {
      belum.push(u);
    }
  });

  // Hapus user exception dari list belum!
  belum = belum.filter(u => !u.exception);

  sendDebug({
    tag: "ABSEN TTK",
    msg: `UserStats: ${JSON.stringify(userStats)}`,
    client_id,
  });

  // *** PATCH: Gunakan username client untuk membangun link ***
  const kontenLinks = posts.map(
    (p) => `https://www.tiktok.com/@${tiktokUsername}/video/${p.video_id}`
  );

  const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "all";

  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Akumulasi Komentar TikTok*\n*Polres*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
    `*Jumlah Konten:* ${totalKonten}\n` +
    `*Daftar Link Konten:*\n${kontenLinks.length ? kontenLinks.join("\n") : "-"}\n\n` +
    `*Jumlah user:* ${users.length}\n` +
    `✅ *Sudah melaksanakan* : *${sudah.length} user*\n` +
    `❌ *Belum melaksanakan* : *${belum.length} user*\n\n`;

  // === List User Sudah ===
  if (mode === "all" || mode === "sudah") {
    msg += `✅ *Sudah melaksanakan* (${sudah.length} user):\n`;
    const sudahDiv = groupByDivision(sudah);
    sortDivisionKeys(Object.keys(sudahDiv)).forEach((div, idx, arr) => {
      const list = sudahDiv[div];
      msg += `*${div}* (${list.length} user):\n`;
      msg +=
        list
          .map((u) => {
            let ket = "";
            if (u.count) ket = `(${u.count}/${totalKonten} konten)`;
            return (
              `- ${u.title ? u.title + " " : ""}${u.nama} : ` +
              `${u.tiktok ? u.tiktok : "belum mengisi data tiktok"} ${ket}`
            );
          })
          .join("\n") + "\n";
      if (idx < arr.length - 1) msg += "\n";
    });
    if (Object.keys(sudahDiv).length === 0) msg += "-\n";
    msg += "\n";
  }

  // === List User Belum ===
  if (mode === "all" || mode === "belum") {
    msg += `❌ *Belum melaksanakan* (${belum.length} user):\n`;
    const belumDiv = groupByDivision(belum);
    sortDivisionKeys(Object.keys(belumDiv)).forEach((div, idx, arr) => {
      const list = belumDiv[div];
      msg += `*${div}* (${list.length} user):\n`;
      msg +=
        list
          .map((u) => {
            let ket = "";
            if (!u.count || u.count === 0) {
              ket = `(0/${totalKonten} konten)`;
            } else if (u.count > 0 && u.count < Math.ceil(totalKonten / 2)) {
              ket = `(${u.count}/${totalKonten} konten)`;
            }
            return (
              `- ${u.title ? u.title + " " : ""}${u.nama} : ` +
              `${u.tiktok ? u.tiktok : "belum mengisi data tiktok"} ${ket}`
            );
          })
          .join("\n") + "\n";
      if (idx < arr.length - 1) msg += "\n";
    });
    if (Object.keys(belumDiv).length === 0) msg += "-\n";
    msg += "\n";
  }

  msg += `Terimakasih.`;
  return msg.trim();
}

export async function lapharTiktokDitbinmas() {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });
  const dateSafe = tanggal.replace(/\//g, "-");
  const timeSafe = jam.replace(/[:.]/g, "-");
  const filename = `Absensi_All_Komentar_Tiktok_Ditbinmas_${hari}_${dateSafe}_${timeSafe}.txt`;
  const filenameBelum = `Absensi_Belum_Komentar_Tiktok_Ditbinmas_${hari}_${dateSafe}_${timeSafe}.txt`;
  const text = await absensiKomentar("DITBINMAS", {
    mode: "all",
    roleFlag: "ditbinmas",
  });
  const textBelum = await absensiKomentar("DITBINMAS", {
    mode: "belum",
    roleFlag: "ditbinmas",
  });
  return { filename, text, filenameBelum, textBelum, narrative: text };
}

// === PER KONTEN ===
export async function absensiKomentarTiktokPerKonten(client_id, opts = {}) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const clientInfo = await getClientInfo(client_id);
  const clientNama = clientInfo.nama;
  const tiktokUsername = clientInfo.tiktok;
  const users = await getUsersByClient(client_id);
  const posts = await getPostsTodayByClient(client_id);
  sendDebug({
    tag: "ABSEN TTK",
    msg: `Start per-konten absensi. Posts=${posts.length} users=${users.length}`,
    client_id,
  });

  if (!posts.length)
    return `Tidak ada konten TikTok untuk *Polres*: *${clientNama}* hari ini.`;

  const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "all";
  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Per Konten Komentar TikTok*\n*Polres*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
    `*Jumlah Konten:* ${posts.length}\n`;

  for (const p of posts) {
    const { comments } = await getCommentsByVideoId(p.video_id);
    const commentSet = new Set(extractUsernamesFromComments(comments));
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Per konten ${p.video_id} comments=${commentSet.size}`,
      client_id,
    });
    let userSudah = [];
    let userBelum = [];
    users.forEach((u) => {
      if (u.exception === true) {
        userSudah.push(u);
      } else if (
        u.tiktok &&
        u.tiktok.trim() !== "" &&
        commentSet.has(u.tiktok.replace(/^@/, "").toLowerCase())
      ) {
        userSudah.push(u);
      } else {
        userBelum.push(u);
      }
    });
    userBelum = userBelum.filter(u => !u.exception);

    // *** PATCH: Gunakan username client untuk membangun link ***
    msg += `\nKonten: https://www.tiktok.com/@${tiktokUsername}/video/${p.video_id}\n`;
    msg += `✅ *Sudah melaksanakan* : *${userSudah.length} user*\n`;
    msg += `❌ *Belum melaksanakan* : *${userBelum.length} user*\n`;

    if (mode === "all" || mode === "sudah") {
      msg += `✅ *Sudah melaksanakan* (${userSudah.length} user):\n`;
      const sudahDiv = groupByDivision(userSudah);
      sortDivisionKeys(Object.keys(sudahDiv)).forEach((div, idx, arr) => {
        const list = sudahDiv[div];
        msg += `*${div}* (${list.length} user):\n`;
        msg += list.length
          ? list.map(u =>
              `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.tiktok || "-"}`
            ).join("\n") + "\n"
          : "-\n";
        if (idx < arr.length - 1) msg += "\n";
      });
      if (Object.keys(sudahDiv).length === 0) msg += "-\n";
      msg += "\n";
    }

    if (mode === "all" || mode === "belum") {
      msg += `❌ *Belum melaksanakan* (${userBelum.length} user):\n`;
      const belumDiv = groupByDivision(userBelum);
      sortDivisionKeys(Object.keys(belumDiv)).forEach((div, idx, arr) => {
        const list = belumDiv[div];
        msg += list.length
          ? `*${div}* (${list.length} user):\n` +
            list.map(u =>
              `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.tiktok || "-"}`
            ).join("\n") + "\n"
          : "-\n";
        if (idx < arr.length - 1) msg += "\n";
      });
      if (Object.keys(belumDiv).length === 0) msg += "-\n";
      msg += "\n";
    }
  }
  msg += `Terimakasih.`;
  return msg.trim();
}
