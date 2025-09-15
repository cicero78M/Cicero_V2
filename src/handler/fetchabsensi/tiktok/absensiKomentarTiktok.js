import { query } from "../../../db/index.js";
import {
  getUsersByClient,
  getUsersByDirektorat,
  getClientsByRole,
} from "../../../model/userModel.js";
import { getPostsTodayByClient } from "../../../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../../../model/tiktokCommentModel.js";
import { hariIndo } from "../../../utils/constants.js";
import { groupByDivision, sortDivisionKeys, formatNama } from "../../../utils/utilsHelper.js";
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

function normalizeUsername(username) {
  return (username || "")
    .toString()
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

export async function collectKomentarRecap(clientId, opts = {}) {
  const { selfOnly, clientFilter } = opts;
  const posts = await getPostsTodayByClient(clientId);
  const videoIds = posts.map((p) => p.video_id);
  const commentSets = [];
  const failedVideoIds = [];
  for (const vid of videoIds) {
    try {
      const { comments } = await getCommentsByVideoId(vid);
      commentSets.push(new Set(extractUsernamesFromComments(comments)));
    } catch (error) {
      failedVideoIds.push(vid);
      commentSets.push(new Set());
      sendDebug({
        tag: "ABSEN TTK",
        msg: {
          event: "comment_fetch_failed",
          videoId: vid,
          error: error?.message || error,
        },
        client_id: clientId,
      });
    }
  }
  if (failedVideoIds.length) {
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`,
      client_id: clientId,
    });
  }
  const roleName = String(clientId || "").toLowerCase();
  let polresIds;
  if (selfOnly) {
    polresIds = [String(clientId).toUpperCase()];
  } else {
    polresIds = (await getClientsByRole(roleName, clientFilter)).map((c) => c.toUpperCase());
  }
  const filterForUsers = selfOnly ? polresIds : clientFilter || polresIds;
  const allUsers = polresIds.length
    ? (await getUsersByDirektorat(roleName, filterForUsers)).filter(
        (u) => u.status === true
      )
    : [];
  const usersByClient = {};
  allUsers.forEach((u) => {
    const cid = u.client_id?.toUpperCase() || "";
    if (!usersByClient[cid]) usersByClient[cid] = [];
    usersByClient[cid].push(u);
  });
  const recap = {};
  for (const cid of polresIds) {
    const { nama: clientName } = await getClientInfo(cid);
    const users = usersByClient[cid] || [];
    const byDiv = groupByDivision(users);
    const sortedDiv = sortDivisionKeys(Object.keys(byDiv));
    const rows = [];
    sortedDiv.forEach((div) => {
      byDiv[div].forEach((u) => {
        const row = {
          pangkat: u.title || "",
          nama: u.nama || "",
          satfung: div,
        };
        videoIds.forEach((vid, idx) => {
          const uname = normalizeUsername(u.tiktok);
          row[vid] = uname && commentSets[idx].has(uname) ? 1 : 0;
        });
        rows.push(row);
      });
    });
    recap[clientName] = rows;
  }
  return { videoIds, recap, failedVideoIds };
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
  const allowedRoles = ["ditbinmas", "ditlantas", "bidhumas"];
  let users;
  if (roleFlag && allowedRoles.includes(roleFlag.toLowerCase())) {
    users = (
      await getUsersByDirektorat(roleFlag.toLowerCase())
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
    return `Tidak ada konten pada akun Official Tiktok *${clientNama}* hari ini.`;

  const userStats = {};
  users.forEach((u) => {
    userStats[u.user_id] = { ...u, count: 0 };
  });

  const failedVideoIds = [];
  const commentSets = await Promise.all(
    posts.map(async (post) => {
      try {
        const { comments } = await getCommentsByVideoId(post.video_id);
        const commentSet = new Set(extractUsernamesFromComments(comments));
        sendDebug({
          tag: "ABSEN TTK",
          msg: `Post ${post.video_id} comments=${commentSet.size}`,
          client_id,
        });
        return commentSet;
      } catch (error) {
        failedVideoIds.push(post.video_id);
        sendDebug({
          tag: "ABSEN TTK",
          msg: {
            event: "comment_fetch_failed",
            videoId: post.video_id,
            error: error?.message || error,
          },
          client_id,
        });
        return new Set();
      }
    })
  );
  if (failedVideoIds.length) {
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`,
      client_id,
    });
  }

  commentSets.forEach((commentSet) => {
    users.forEach((u) => {
      if (
        u.tiktok &&
        u.tiktok.trim() !== "" &&
        commentSet.has(u.tiktok.replace(/^@/, "").toLowerCase())
      ) {
        userStats[u.user_id].count += 1;
      }
    });
  });

  const totalKonten = posts.length;

  if (client_id.toUpperCase() === "DITBINMAS") {
    const groups = {};
    Object.values(userStats).forEach((u) => {
      const cid = u.client_id?.toUpperCase() || "";
      if (!groups[cid])
        groups[cid] = {
          total: 0,
          sudah: 0,
          kurang: 0,
          belum: 0,
          noUsername: 0,
        };
      const g = groups[cid];
      g.total++;
      if (u.exception === true) {
        g.sudah++;
      } else if (!u.tiktok || u.tiktok.trim() === "") {
        g.noUsername++;
      } else if (u.count >= Math.ceil(totalKonten / 2)) {
        g.sudah++;
      } else if (u.count > 0) {
        g.kurang++;
      } else {
        g.belum++;
      }
    });
    const kontenLinks = posts.map(
      (p) => `https://www.tiktok.com/@${tiktokUsername}/video/${p.video_id}`
    );
    const sortedCids = Object.keys(groups).sort((a, b) => {
      if (a === "DITBINMAS") return -1;
      if (b === "DITBINMAS") return 1;
      const ga = groups[a];
      const gb = groups[b];
      const aEligible = ga.total >= 100;
      const bEligible = gb.total >= 100;
      if (aEligible && bEligible) {
        const pa = ga.sudah / ga.total;
        const pb = gb.sudah / gb.total;
        if (pb !== pa) return pb - pa;
      } else if (aEligible) {
        return -1;
      } else if (bEligible) {
        return 1;
      }
      return gb.sudah - ga.sudah;
    });
    const reports = await Promise.all(
      sortedCids.map(async (cid, index) => {
        const { nama } = await getClientInfo(cid);
        const g = groups[cid];
        const lines = [
          `*${index + 1}. ${nama}*`,
          `*Jumlah user:* ${g.total}`,
          `*Sudah Melaksanakan* : *${g.sudah+g.kurang} user*`,
          `*Melaksanakan Lengkap* : *${g.sudah} user*`,
        ];
        if (g.kurang > 0) {
          lines.push(`*Melaksanakan Kurang Lengkap* : *${g.kurang} user*`);
        }
        if (g.belum > 0) {
          lines.push(`*Belum Melaksanakan* : *${g.belum} user*`);
        }
        if (g.noUsername > 0) {
          lines.push(`*Belum Input Username Tiktok* : *${g.noUsername} user*`);
        }
        return lines.join("\n");
      })
    );

    const totals = Object.values(groups).reduce(
      (acc, g) => {
        acc.total += g.total;
        acc.sudah += g.sudah;
        acc.kurang += g.kurang;
        acc.belum += g.belum;
        acc.noUsername += g.noUsername;
        return acc;
      },
      { total: 0, sudah: 0, kurang: 0, belum: 0, noUsername: 0 }
    );

    let msg =
      `Mohon ijin Komandan,\n\n` +
      `📋 *Rekap Akumulasi Komentar TikTok*\n*Direktorat*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
      `*Jumlah Konten:* ${totalKonten}\n` +
      `*Daftar Link Konten:*\n${kontenLinks.length ? kontenLinks.join("\n") : "-"}` +
      `\n\n*Total Personel:* ${totals.total}\n` +
      `✅ *Sudah Melaksanakan* : *${totals.sudah+totals.kurang} user*\n` +
      `- ✅ *Melaksanakan Lengkap* : *${totals.sudah} user*\n` +
      `- ⚠️ *Melaksanakan Kurang Lengkap* : *${totals.kurang} user*\n` +
      `❌ *Belum Melaksanakan* : *${totals.belum} user*\n` +
      `⚠️❌ *Belum Input Username Tiktok* : *${totals.noUsername} user*\n\n` +

      reports.join("\n\n");

    if (failedVideoIds.length) {
      msg += `\n\n⚠️ Data komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`;
    }

    msg += `\n\nTerimakasih.`;
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
    `📋 *Rekap Akumulasi Komentar TikTok*\n*${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
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

  if (failedVideoIds.length) {
    msg += `⚠️ Data komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}.\n\n`;
  }

  msg += `Terimakasih.`;
  return msg.trim();
}

export async function absensiKomentarDitbinmasSimple() {
  const roleName = "ditbinmas";
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const posts = await getPostsTodayByClient(roleName);
  if (!posts.length)
    return "Tidak ada konten TikTok pada akun Official DIREKTORAT BINMAS hari ini.";

  const { tiktok: mainUsername, nama: dirName } = await getClientInfo(roleName);
  const kontenLinks = posts.map(
    (p) => `https://www.tiktok.com/@${mainUsername}/video/${p.video_id}`
  );

  const failedVideoIds = [];
  const commentSets = await Promise.all(
    posts.map(async (p) => {
      try {
        const { comments } = await getCommentsByVideoId(p.video_id);
        return new Set(extractUsernamesFromComments(comments));
      } catch (error) {
        failedVideoIds.push(p.video_id);
        sendDebug({
          tag: "ABSEN TTK",
          msg: {
            event: "comment_fetch_failed",
            videoId: p.video_id,
            error: error?.message || error,
          },
          client_id: roleName,
        });
        return new Set();
      }
    })
  );
  if (failedVideoIds.length) {
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`,
      client_id: roleName,
    });
  }

  const allUsersRaw = await getUsersByDirektorat(roleName, "DITBINMAS");
  const allUsers = allUsersRaw.filter(
    (u) => u.status === true && (u.client_id || "").toUpperCase() === "DITBINMAS"
  );

  const totals = {
    total: allUsers.length,
    lengkap: 0,
    kurang: 0,
    belum: 0,
    tanpaUsername: 0,
  };
  allUsers.forEach((u) => {
    if (!u.tiktok || u.tiktok.trim() === "") {
      totals.tanpaUsername++;
      return;
    }
    const uname = normalizeUsername(u.tiktok);
    let count = 0;
    commentSets.forEach((set) => {
      if (set.has(uname)) count += 1;
    });
    if (count === posts.length) totals.lengkap++;
    else if (count > 0) totals.kurang++;
    else totals.belum++;
  });

  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 Rekap Komentar TikTok (Simple)\n` +
    `*${dirName.toUpperCase()}*\n` +
    `${hari}, ${tanggal}\nJam: ${jam}\n\n` +
    `*Jumlah Konten:* ${posts.length}\n` +
    `*Daftar Link Konten:*\n${kontenLinks.join("\n")}\n\n` +
    `*Jumlah Total Personil:* ${totals.total} pers\n` +
    `✅ *Melaksanakan Lengkap :* ${totals.lengkap} pers\n` +
    `⚠️ *Melaksanakan Kurang :* ${totals.kurang} pers\n` +
    `❌ *Belum :* ${totals.belum} pers\n` +
    `⚠️❌ *Belum Input Username TikTok :* ${totals.tanpaUsername} pers`;

  if (failedVideoIds.length) {
    msg += `\n\n⚠️ Data komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`;
  }

  return msg.trim();
}

export async function absensiKomentarDitbinmasReport() {
  const roleName = "ditbinmas";
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const posts = await getPostsTodayByClient(roleName);
  if (!posts.length)
    return "Tidak ada konten TikTok pada akun Official DIREKTORAT BINMAS hari ini.";

  const { tiktok: mainUsername, nama: dirName } = await getClientInfo(roleName);
  const kontenLinks = posts.map(
    (p) => `https://www.tiktok.com/@${mainUsername}/video/${p.video_id}`
  );

  const failedVideoIds = [];
  const commentSets = await Promise.all(
    posts.map(async (p) => {
      try {
        const { comments } = await getCommentsByVideoId(p.video_id);
        return new Set(extractUsernamesFromComments(comments));
      } catch (error) {
        failedVideoIds.push(p.video_id);
        sendDebug({
          tag: "ABSEN TTK",
          msg: {
            event: "comment_fetch_failed",
            videoId: p.video_id,
            error: error?.message || error,
          },
          client_id: roleName,
        });
        return new Set();
      }
    })
  );
  if (failedVideoIds.length) {
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`,
      client_id: roleName,
    });
  }

  const allUsersRaw = await getUsersByDirektorat(roleName, "DITBINMAS");
  const allUsers = allUsersRaw.filter(
    (u) =>
      u.status === true && (u.client_id || "").toUpperCase() === "DITBINMAS"
  );

  const usersByDiv = {};
  allUsers.forEach((u) => {
    const div = u.divisi?.toUpperCase() || "-";
    if (!usersByDiv[div]) usersByDiv[div] = [];
    usersByDiv[div].push(u);
  });

  const totalKonten = posts.length;
  const reportEntries = [];
  const totals = { total: 0, sudah: 0, kurang: 0, belum: 0, noUsername: 0 };

  const divisions = sortDivisionKeys(Object.keys(usersByDiv));

  for (const div of divisions) {
    const users = usersByDiv[div] || [];
    const sudah = [];
    const kurang = [];
    const belum = [];
    const tanpaUsername = [];

    users.forEach((u) => {
      if (!u.tiktok || u.tiktok.trim() === "") {
        tanpaUsername.push(u);
        return;
      }
      const uname = normalizeUsername(u.tiktok);
      let count = 0;
      commentSets.forEach((set) => {
        if (set.has(uname)) count += 1;
      });
      const percentage = totalKonten ? (count / totalKonten) * 100 : 0;
      if (percentage >= 50) sudah.push(u);
      else if (percentage > 0) kurang.push(u);
      else belum.push(u);
    });

    const belumCount = belum.length + tanpaUsername.length;
    totals.total += users.length;
    totals.sudah += sudah.length;
    totals.kurang += kurang.length;
    totals.belum += belumCount;
    totals.noUsername += tanpaUsername.length;

    reportEntries.push({
      clientName: div,
      usersCount: users.length,
      sudahCount: sudah.length,
      kurangCount: kurang.length,
      belumCount,
      noUsernameCount: tanpaUsername.length,
      sudahList: sudah.map((u) => `- ${formatNama(u)}`),
      kurangList: kurang.map((u) => `- ${formatNama(u)}`),
      belumList: belum.map((u) => `- ${formatNama(u)}`),
      noUsernameList: tanpaUsername.map((u) => `- ${formatNama(u)}`),
    });
  }

  reportEntries.sort((a, b) => {
    const aBinmas = a.clientName.toUpperCase() === "DITBINMAS";
    const bBinmas = b.clientName.toUpperCase() === "DITBINMAS";
    if (aBinmas && !bBinmas) return -1;
    if (bBinmas && !aBinmas) return 1;

    const aPct = a.usersCount ? a.sudahCount / a.usersCount : 0;
    const bPct = b.usersCount ? b.sudahCount / b.usersCount : 0;
    if (aPct !== bPct) return bPct - aPct;

    if (a.usersCount !== b.usersCount) return b.usersCount - a.usersCount;
    return a.clientName.localeCompare(b.clientName);
  });

  const reports = reportEntries.map((r, idx) => {
    const sudahList = r.sudahList.length ? r.sudahList.join("\n") : "-";
    const kurangList = r.kurangList.length ? r.kurangList.join("\n") : "-";
    const belumList = r.belumList.length ? r.belumList.join("\n") : "-";
    const noUsernameList = r.noUsernameList.length
      ? r.noUsernameList.join("\n")
      : "-";

    let entry =
      `${idx + 1}. ${r.clientName}\n` +
      `*Jumlah Personil* : ${r.usersCount} pers\n` +
      `✅ Melaksanakan Lengkap (${r.sudahCount} pers):\n${sudahList}`;

    if (r.kurangCount > 0) {
      entry += `\n⚠️ Melaksanakan Kurang Lengkap (${r.kurangCount} pers):\n${kurangList}`;
    }

    if (r.belumList.length > 0) {
      entry += `\n❌ Belum melaksanakan (${r.belumList.length} pers):\n${belumList}`;
    }

    if (r.noUsernameCount > 0) {
      entry += `\n⚠️ Belum Update Username TikTok (${r.noUsernameCount} pers):\n${noUsernameList}`;
    }

    return entry;
  });

  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Akumulasi Komentar TikTok*\n` +
    `*Polres*: *${dirName}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
    `*Jumlah Konten:* ${totalKonten}\n` +
    `*Daftar Link Konten:*\n${kontenLinks.length ? kontenLinks.join("\n") : "-"}\n\n` +
    `*Jumlah Total Personil:* ${totals.total} pers\n` +
    `✅ *Sudah Melaksanakan* : *${totals.sudah+totals.kurang} pers*\n` +
    `- ✅ *Melaksanakan Lengkap* : *${totals.sudah} pers*\n` +
    `- ⚠️ *Melaksanakan kurang lengkap* : *${totals.kurang} pers*\n` +
    `❌ *Belum melaksanakan* : *${totals.belum} pers*\n` +
    `⚠️❌ *Belum Update Username TikTok* : *${totals.noUsername} pers*\n\n` +
    reports.join("\n");

  if (failedVideoIds.length) {
    msg += `\n\n⚠️ Data komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`;
  }

  msg += "\n\nTerimakasih.";

  return msg.trim();
}

export async function lapharTiktokDitbinmas() {
  const roleName = "ditbinmas";
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });
  const dateSafe = tanggal.replace(/\//g, "-");
  const timeSafe = jam.replace(/[:.]/g, "-");
  const filename = `Absensi_All_Engagement_Tiktok_${hari}_${dateSafe}_${timeSafe}.txt`;
  const filenameBelum = `Absensi_Belum_Engagement_Tiktok_${hari}_${dateSafe}_${timeSafe}.txt`;

  const posts = await getPostsTodayByClient(roleName);
  if (!posts.length)
    return { filename, text: "Tidak ada konten TikTok untuk DIREKTORAT BINMAS hari ini." };

  const { tiktok: mainUsername } = await getClientInfo(roleName);
  const kontenLinks = [];
  const commentSets = [];
  const commentCounts = [];
  const failedVideoIds = [];
  for (const p of posts) {
    const link = `https://www.tiktok.com/@${mainUsername}/video/${p.video_id}`;
    kontenLinks.push(link);
    try {
      const { comments } = await getCommentsByVideoId(p.video_id);
      const cSet = new Set(extractUsernamesFromComments(comments));
      commentSets.push(cSet);
      commentCounts.push(cSet.size);
    } catch (error) {
      failedVideoIds.push(p.video_id);
      commentSets.push(new Set());
      commentCounts.push(0);
      sendDebug({
        tag: "ABSEN TTK",
        msg: {
          event: "comment_fetch_failed",
          videoId: p.video_id,
          error: error?.message || error,
        },
        client_id: roleName,
      });
    }
  }

  if (failedVideoIds.length) {
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`,
      client_id: roleName,
    });
  }

  const { getClientsByRole } = await import("../../../model/userModel.js");
  const polresIds = (
    await getClientsByRole(roleName)
  )
    .map((c) => c.toUpperCase())
    .filter((cid) => cid !== "DITBINMAS");
  const clientIds = ["DITBINMAS", ...polresIds];
  const allUsers = (
    await getUsersByDirektorat(roleName, clientIds)
  ).filter((u) => u.status === true);

  const usersByClient = {};
  clientIds.forEach((cid) => (usersByClient[cid] = []));
  allUsers.forEach((u) => {
    const cid = (u.client_id || "").toUpperCase();
    if (!usersByClient[cid]) usersByClient[cid] = [];
    usersByClient[cid].push(u);
  });

  commentSets.forEach((set, idx) => {
    commentCounts[idx] = set.size;
  });
  const failedVideoSet = new Set(failedVideoIds);
  const kontenLinkComments = kontenLinks.map((link, idx) => {
    const videoId = posts[idx]?.video_id;
    if (videoId && failedVideoSet.has(videoId)) {
      return `${link} : GAGAL`;
    }
    return `${link} : ${commentCounts[idx]}`;
  });

  const pangkatOrder = [
    "KOMISARIS BESAR POLISI",
    "AKBP",
    "KOMPOL",
    "AKP",
    "IPTU",
    "IPDA",
    "AIPTU",
    "AIPDA",
    "BRIPKA",
    "BRIGADIR",
    "BRIPTU",
    "BRIPDA",
  ];
  const rankIdx = (t) => {
    const i = pangkatOrder.indexOf((t || "").toUpperCase());
    return i === -1 ? pangkatOrder.length : i;
  };

  const totals = {
    total: 0,
    sudah: 0,
    kurang: 0,
    belum: 0,
    noUsername: 0,
    noTiktok: 0,
  };
  const perClientStats = [];
  const perClientBelumBlocks = [];

  for (const cid of clientIds) {
    const users = usersByClient[cid] || [];
    const already = [];
    const partial = [];
    const none = [];
    const noUname = [];
    let noTiktok = 0;

    users.forEach((u) => {
      if (!u.insta || u.insta.trim() === "") {
        noUname.push(u);
      }
      if (!u.tiktok || u.tiktok.trim() === "") {
        noTiktok++;
        return;
      }
      const uname = normalizeUsername(u.tiktok);
      let count = 0;
      commentSets.forEach((set) => {
        if (set.has(uname)) count += 1;
      });
      if (count === posts.length) already.push({ ...u, count });
      else if (count > 0) partial.push({ ...u, count });
      else none.push({ ...u, count });
    });

    totals.total += users.length;
    totals.sudah += already.length;
    totals.kurang += partial.length;
    totals.belum += none.length + noUname.length;
    totals.noUsername += noUname.length;
    totals.noTiktok += noTiktok;

    const { nama: clientName } = await getClientInfo(cid);

    const sortUsers = (arr) =>
      arr.sort(
        (a, b) =>
          rankIdx(a.title) - rankIdx(b.title) ||
          String(a.user_id).localeCompare(String(b.user_id))
      );

    sortUsers(already);
    sortUsers(partial);
    sortUsers(none);
    sortUsers(noUname);

    const commentSum =
      already.reduce((acc, u) => acc + (u.count || 0), 0) +
      partial.reduce((acc, u) => acc + (u.count || 0), 0);

    const blockLines = [
      `*${clientName.toUpperCase()}* : ${users.length} / ${already.length} / ${partial.length} / ${
        none.length + noUname.length
      } / ${noUname.length} / ${noTiktok}`,
      `Komentar lengkap : ${already.length}`,
      ...already.map((u) => `- ${formatNama(u)}, ${u.count}`),
    ];

    blockLines.push("");
    blockLines.push(`Komentar Kurang : ${partial.length}`);
    if (partial.length) {
      blockLines.push(...partial.map((u) => `- ${formatNama(u)}, ${u.count}`));
    }

    blockLines.push("");
    blockLines.push(`Belum Komentar : ${none.length}`);
    if (none.length) {
      blockLines.push("");
      blockLines.push(...none.map((u) => `- ${formatNama(u)}, ${u.tiktok || "-"}`));
    }

    blockLines.push("");
    blockLines.push(`Belum Input Sosial media : ${noUname.length}`);
    if (noUname.length) {
      blockLines.push("");
      blockLines.push(
        ...noUname.map(
          (u) =>
            `- ${formatNama(u)}, IG ${u.insta ? u.insta : "Kosong"}, Tiktok ${
              u.tiktok ? u.tiktok : "Kosong"
            }`
        )
      );
    }

    const igPercent = users.length
      ? ((users.length - noUname.length) / users.length) * 100
      : 0;
    const tiktokPercent = users.length
      ? ((users.length - noTiktok) / users.length) * 100
      : 0;

    perClientStats.push({
      cid,
      name: clientName.toUpperCase(),
      comments: commentSum,
      block: blockLines.join("\n"),
      igPercent,
      tiktokPercent,
      noUsername: noUname.length,
      noTiktok,
      totalUsers: users.length,
    });

    if (none.length || noUname.length) {
      const belumLines = [`*${clientName.toUpperCase()}*`];
      if (none.length) {
        belumLines.push(`Belum Komentar : ${none.length}`);
        belumLines.push(
          ...none.map((u) => `- ${formatNama(u)}, ${u.tiktok || "-"}`)
        );
      }
      if (noUname.length) {
        if (none.length) belumLines.push("");
        belumLines.push(`Belum Input Sosial media : ${noUname.length}`);
        belumLines.push(
          ...noUname.map(
            (u) =>
              `- ${formatNama(u)}, IG ${u.insta ? u.insta : "Kosong"}, Tiktok ${
                u.tiktok ? u.tiktok : "Kosong"
              }`
          )
        );
      }
      perClientBelumBlocks.push(belumLines.join("\n"));
    }
  }

  perClientStats.sort((a, b) => {
    if (a.cid === "DITBINMAS") return -1;
    if (b.cid === "DITBINMAS") return 1;
    if (a.comments !== b.comments) return b.comments - a.comments;
    return a.name.localeCompare(b.name);
  });

  const perClientBlocks = perClientStats.map((p) => p.block);
  const totalComments = perClientStats.reduce((acc, p) => acc + p.comments, 0);
  const totalPossibleComments = totals.total * posts.length;
  const commentPercent = totalPossibleComments
    ? (totalComments / totalPossibleComments) * 100
    : 0;
  const targetComments = Math.ceil(totalPossibleComments * 0.95);
  const deficit = targetComments - totalComments;

  const topContribArr = [...perClientStats]
    .sort((a, b) => b.comments - a.comments)
    .slice(0, 4);
  const topContrib = topContribArr
    .map((p) => `${p.name} ${p.comments}`)
    .join(", ");
  const topContribPercent = totalComments
    ? (
        (topContribArr.reduce((acc, p) => acc + p.comments, 0) / totalComments) *
        100
      ).toFixed(1)
    : "0";

  const satkerStats = perClientStats.filter((p) => p.cid !== "DITBINMAS");
  const fmtNum = (n) => n.toLocaleString("id-ID");
  const fmtPct = (n) =>
    n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const median = (arr) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const igUpdated = totals.total - totals.noUsername;
  const tiktokUpdated = totals.total - totals.noTiktok;
  const igOverallPercent = totals.total ? (igUpdated / totals.total) * 100 : 0;
  const tiktokOverallPercent = totals.total
    ? (tiktokUpdated / totals.total) * 100
    : 0;
  const avgIg =
    satkerStats.reduce((acc, p) => acc + p.igPercent, 0) /
    (satkerStats.length || 1);
  const avgTiktok =
    satkerStats.reduce((acc, p) => acc + p.tiktokPercent, 0) /
    (satkerStats.length || 1);
  const medianIg = median(satkerStats.map((p) => p.igPercent));
  const medianTiktok = median(satkerStats.map((p) => p.tiktokPercent));
  const lowSatker = satkerStats.filter(
    (p) => p.igPercent < 10 && p.tiktokPercent < 10
  );
  const bestSatkers = satkerStats.filter(
    (p) => p.igPercent >= 90 && p.tiktokPercent >= 90
  );
  const strongSatkers = satkerStats.filter(
    (p) =>
      p.igPercent >= 80 &&
      p.tiktokPercent >= 80 &&
      (p.igPercent < 90 || p.tiktokPercent < 90)
  );
  const topAvgStats = satkerStats
    .map((p) => ({ ...p, avg: (p.igPercent + p.tiktokPercent) / 2 }))
    .sort((a, b) => b.avg - a.avg);
  const topPerformers = topAvgStats.slice(0, 5);
  const topPerformerLines = topPerformers
    .map(
      (p, idx) =>
        `${idx + 1}. ${p.name} ${p.igPercent.toFixed(1)}/${p.tiktokPercent.toFixed(1)}`
    )
    .join(", ");
  const bottomPerformersArr = [...topAvgStats].reverse().slice(0, 5);
  const bottomPerformerLines = bottomPerformersArr
    .map(
      (p) =>
        `* ${p.name} ${p.igPercent.toFixed(1)}% / ${p.tiktokPercent.toFixed(1)}%`
    )
    .join("\n");
  const extraUnderTen = satkerStats
    .filter(
      (p) =>
        p.igPercent < 10 &&
        p.tiktokPercent < 10 &&
        !bottomPerformersArr.some((b) => b.cid === p.cid)
    )
    .map((p) => p.name);
  const gapThreshold = 10;
  const gapCandidates = perClientStats.filter(
    (p) => Math.abs(p.igPercent - p.tiktokPercent) >= gapThreshold
  );
  const gapLines = gapCandidates.map((p) => {
    const diff = p.igPercent - p.tiktokPercent;
    const sign = diff >= 0 ? "+" : "-";
    const dir = diff >= 0 ? "ke IG" : "ke TT";
    return `* *${p.name}* IG ${p.igPercent.toFixed(1)}% vs TT ${p.tiktokPercent.toFixed(
      1
    )}% (*${sign}${Math.abs(diff).toFixed(1)} poin ${dir}*)`;
  });
  const igBacklog = totals.noUsername;
  const tiktokBacklog = totals.noTiktok;
  const top10Ig = [...satkerStats]
    .filter((p) => p.noUsername > 0)
    .sort((a, b) => b.noUsername - a.noUsername)
    .slice(0, 10);
  const top10IgList = top10Ig
    .map((p) => `${p.name} (${fmtNum(p.noUsername)})`)
    .join(", ");
  const top10IgSum = top10Ig.reduce((acc, p) => acc + p.noUsername, 0);
  const top10IgPercent = igBacklog
    ? (top10IgSum / igBacklog) * 100
    : 0;
  const top10Tiktok = [...satkerStats]
    .filter((p) => p.noTiktok > 0)
    .sort((a, b) => b.noTiktok - a.noTiktok)
    .slice(0, 10);
  const top10TiktokList = top10Tiktok
    .map((p) => `${p.name} (${fmtNum(p.noTiktok)})`)
    .join(", ");
  const top10TiktokSum = top10Tiktok.reduce((acc, p) => acc + p.noTiktok, 0);
  const top10TiktokPercent = tiktokBacklog
    ? (top10TiktokSum / tiktokBacklog) * 100
    : 0;
  const projectedIgPercent = totals.total
    ? ((igUpdated + 0.7 * top10IgSum) / totals.total) * 100
    : 0;
  const projectedTiktokPercent = totals.total
    ? ((tiktokUpdated + 0.7 * top10TiktokSum) / totals.total) * 100
    : 0;
  const backlogBig = top10Ig.slice(0, 6).map((p) => p.name);
  const largestGapPos = gapCandidates
    .filter((p) => p.igPercent > p.tiktokPercent)
    .sort(
      (a, b) => (b.igPercent - b.tiktokPercent) - (a.igPercent - a.tiktokPercent)
    )[0];
  const largestGapNeg = gapCandidates
    .filter((p) => p.tiktokPercent > p.igPercent)
    .sort(
      (a, b) => (b.tiktokPercent - b.igPercent) - (a.tiktokPercent - a.igPercent)
    )[0];
  const mentorList = topPerformers.map((p) => p.name);
  const lowestInput = bottomPerformersArr.map((p) => p.name);
  const bestSatkerNames = bestSatkers.map((p) => p.name);
  const strongSatkerList = strongSatkers.map(
    (p) => `${p.name} (${p.igPercent.toFixed(1)}% / ${p.tiktokPercent.toFixed(1)}%)`
  );
  const notesLines = [];
  if (backlogBig.length)
    notesLines.push(`* *${backlogBig.join(', ')}* → backlog terbesar;`);
  if (lowestInput.length)
    notesLines.push(
      `* *${lowestInput.join(', ')}* → Input Username Ter rendah`
    );
  if (largestGapPos)
    notesLines.push(
      `* *${largestGapPos.name}* → Anomali TT sangat rendah; Menjadi perhatian khusus.`
    );
  if (largestGapNeg)
    notesLines.push(`* *${largestGapNeg.name}* → TT unggul;`);
  if (mentorList.length)
    notesLines.push(
      `* *${mentorList.join('/')}* → pertahankan; mendorong sebagai mentor lintas satker( minta saran masukan).`
    );
  const notesSection = notesLines.join("\n");

  let text =
    `Mohon ijin Komandan,\n\n` +
    `📋 Rekap Akumulasi Komentar TikTok\n` +
    `*DIREKTORAT BINMAS*\n` +
    `${hari}, ${tanggal}\n` +
    `Jam: ${jam}\n\n` +
    `Jumlah Konten: ${posts.length}\n` +
    `Daftar Link Konten Tiktok:\n${kontenLinks.map((l) => `- ${l}`).join("\n")}\n\n` +
    `Jumlah Total Personil : ${totals.total} pers\n` +
    `Sudah Melaksanakan : ${totals.sudah+totals.kurang} pers\n` +
    `- Melaksanakan lengkap : ${totals.sudah} pers\n` +
    `- Melaksanakan kurang lengkap : ${totals.kurang} pers\n` +
    `Belum melaksanakan : ${totals.belum} pers\n` +
    `Belum Update Username Tiktok : ${totals.noTiktok} pers\n\n` +
    `_Kesatuan  :  Jumlah user / Sudah komentar / Komentar kurang/ Belum komentar/ Belum input TikTok_\n` +
    `${perClientBlocks.join("\n\n")}`;

  let narrative =
    `Mohon Ijin Komandan, melaporkan perkembangan Implementasi Update data dan Absensi komentar oleh personil hari ${hari}, ${tanggal} pukul ${jam} WIB.\n\n` +
    `DIREKTORAT BINMAS\n\n` +
    `Konten Tiktok hari ini: ${posts.length} link: ${kontenLinkComments.join(", ")}\n\n` +
    `Kinerja Komentar konten: ${totalComments}/${totalPossibleComments} (${commentPercent.toFixed(2)}%)\n` +
    `Target harian ≥95% = ${targetComments} komentar${deficit > 0 ? ` → kekurangan ${deficit}` : ""}\n\n` +
    `Kontributor komentar terbesar (konten hari ini):\n${topContrib ? `${topContrib} → menyumbang ${topContribPercent}% dari total komentar saat ini.` : "-"}\n\n` +
    `Absensi Update Data\n\n` +
    `*Personil Saat ini :* ${fmtNum(totals.total)} Personil\n` +
    `* *Cakupan keseluruhan:* IG *${fmtPct(igOverallPercent)}%* (${fmtNum(igUpdated)}/${fmtNum(totals.total)}), TT *${fmtPct(tiktokOverallPercent)}%* (${fmtNum(tiktokUpdated)}/${fmtNum(totals.total)}).\n` +
    `* *Rata-rata satker:* IG *${fmtPct(avgIg)}%* (median ${fmtPct(medianIg)}%), TT *${fmtPct(avgTiktok)}%* (median ${fmtPct(medianTiktok)}%)${lowSatker.length ? ` → penyebaran masih lebar, ${lowSatker.length} satker di bawah 10%.` : ""}\n` +
    `* *Satker dengan Capaian terbaik (≥90% IG & TT):* ${bestSatkerNames.length ? `*${bestSatkerNames.join(', ')}*` : '-'}\n` +
    `* *Tambahan kuat (≥80% IG & TT):* ${strongSatkerList.length ? `*${strongSatkerList.join(', ')}*` : '-'}\n\n` +
    `#Highlight Pencapaian & Masalah\n\n` +
    `*Top performer (rata-rata IG/TT):*\n\n` +
    `${topPerformerLines}\n\n` +
    `*Bottom performer (rata-rata IG/TT, sangat rendah di kedua platform):*\n\n` +
    `${bottomPerformerLines}${extraUnderTen.length ? `\n  *(juga: ${extraUnderTen.join(', ')} berada <10% IG/TT)*` : ''}\n\n` +
    `*Kesenjangan IG vs TikTok (perlu investigasi):*\n\n` +
    `${gapLines.length ? gapLines.join('\n') : '-'}\n\n` +
    `# Konsentrasi Backlog (prioritas penanganan)\n\n` +
    `> *Top-10 yang usernya belum melakukan update username menyerap >50% backlog* masing-masing platform.\n\n` +
    `* *IG Belum Diisi (${fmtNum(igBacklog)})* – 10 terbesar (≈*${fmtPct(top10IgPercent)}%* dari backlog):\n  ${top10IgList}.\n\n` +
    `* *TikTok Belum Diisi (${fmtNum(tiktokBacklog)})* – 10 terbesar (≈*${fmtPct(top10TiktokPercent)}%*):\n  ${top10TiktokList}.\n\n` +
    `*Proyeksi dampak cepat:* menutup *70%* backlog di Top-10 (mendorong satker untuk update data cepat) akan menaikkan capaian *IG → ~${fmtPct(projectedIgPercent)}%* dan *TT → ~${fmtPct(projectedTiktokPercent)}%*.\n\n` +
    `## Catatan per Satker.\n\n` +
    `${notesSection}\n\n` +
    `Demikian Komandan hasil analisa yang bisa kami laporkan.`;

  let textBelum =
    `Belum melaksanakan Komentar atau belum input username IG/Tiktok\n` +
    `Polres: DIREKTORAT BINMAS\n` +
    `${hari}, ${tanggal}\n` +
    `Jam: ${jam}\n\n` +
    `${perClientBelumBlocks.join("\n\n")}`;

  if (failedVideoIds.length) {
    const failureNote = `⚠️ Data komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`;
    text += `\n\n${failureNote}`;
    narrative += `\n\n${failureNote}`;
    textBelum += `\n\n${failureNote}`;
  }

  return {
    filename,
    text: text.trim(),
    narrative,
    filenameBelum,
    textBelum: textBelum.trim(),
  };
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
  const clientLabel =
    clientInfo.clientType && clientInfo.clientType.toLowerCase() === "direktorat"
      ? "Direktorat"
      : "Polres";
  const users = await getUsersByClient(client_id);
  const posts = await getPostsTodayByClient(client_id);
  sendDebug({
    tag: "ABSEN TTK",
    msg: `Start per-konten absensi. Posts=${posts.length} users=${users.length}`,
    client_id,
  });

  if (!posts.length)
    return `Tidak ada konten TikTok untuk *${clientLabel}*: *${clientNama}* hari ini.`;

  const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "all";
  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Per Konten Komentar TikTok*\n*${clientLabel}*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
    `*Jumlah Konten:* ${posts.length}\n`;

  const failedVideoIds = [];
  for (const p of posts) {
    let commentSet = new Set();
    let fetchFailed = false;
    try {
      const { comments } = await getCommentsByVideoId(p.video_id);
      commentSet = new Set(extractUsernamesFromComments(comments));
      sendDebug({
        tag: "ABSEN TTK",
        msg: `Per konten ${p.video_id} comments=${commentSet.size}`,
        client_id,
      });
    } catch (error) {
      fetchFailed = true;
      failedVideoIds.push(p.video_id);
      sendDebug({
        tag: "ABSEN TTK",
        msg: {
          event: "comment_fetch_failed",
          videoId: p.video_id,
          error: error?.message || error,
        },
        client_id,
      });
    }
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

    if (fetchFailed) {
      msg += `⚠️ Data komentar gagal diambil untuk konten ini.\n`;
    }

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
  if (failedVideoIds.length) {
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`,
      client_id,
    });
    msg += `\n⚠️ Data komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}.\n`;
  }
  msg += `Terimakasih.`;
  return msg.trim();
}
