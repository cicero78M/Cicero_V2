import { query } from "../../../db/index.js";
import {
  getUsersByClient,
  getUsersByDirektorat,
  getClientsByRole,
} from "../../../model/userModel.js";
import { getShortcodesTodayByClient } from "../../../model/instaPostModel.js";
import { getLikesByShortcode } from "../../../model/instaLikeModel.js";
import { hariIndo } from "../../../utils/constants.js";
import { groupByDivision, sortDivisionKeys, formatNama } from "../../../utils/utilsHelper.js";
import { findClientById } from "../../../service/clientService.js";

function normalizeUsername(username) {
  return (username || "")
    .toString()
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

async function getClientInfo(client_id) {
  const res = await query(
    "SELECT nama, client_type FROM clients WHERE LOWER(client_id) = LOWER($1) LIMIT 1",
    [client_id]
  );
  return {
    nama: res.rows[0]?.nama || client_id,
    clientType: res.rows[0]?.client_type || null,
  };
}

export async function collectLikesRecap(clientId, opts = {}) {
  const roleName = String(clientId || "").toLowerCase();
  const shortcodes = await getShortcodesTodayByClient(clientId);
  const likesLists = await Promise.all(
    shortcodes.map((sc) => getLikesByShortcode(sc))
  );
  const likesSets = likesLists.map(
    (likes) => new Set((likes || []).map(normalizeUsername))
  );
  let polresIds;
  if (opts.selfOnly) {
    polresIds = [String(clientId).toUpperCase()];
  } else {
    polresIds = (await getClientsByRole(roleName)).map((c) => c.toUpperCase());
  }
  const allUsers = (
    await getUsersByDirektorat(roleName, polresIds)
  ).filter((u) => u.status === true);
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
        shortcodes.forEach((sc, idx) => {
          const uname = normalizeUsername(u.insta);
          row[sc] = uname && likesSets[idx].has(uname) ? 1 : 0;
        });
        rows.push(row);
      });
    });
    recap[clientName] = rows;
  }
  return { shortcodes, recap };
}

// === AKUMULASI ===
export async function absensiLikes(client_id, opts = {}) {
  const { clientFilter } = opts;
  const roleFlag = opts.roleFlag;
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const { nama: clientNama, clientType } = await getClientInfo(client_id);
  const allowedRoles = ["ditbinmas", "ditlantas", "bidhumas"];
  const normalizedRole = (roleFlag || "").toLowerCase();
  const normalizedClient = (client_id || "").toLowerCase();
  const isDirektoratContext =
    clientType === "direktorat" ||
    (allowedRoles.includes(normalizedRole) && normalizedRole === normalizedClient);

  if (isDirektoratContext) {
    const roleName = allowedRoles.includes(normalizedRole)
      ? normalizedRole
      : normalizedClient;
    const shortcodes = await getShortcodesTodayByClient(roleName);
    if (!shortcodes.length)
      return `Tidak ada konten IG untuk *${clientNama}* hari ini.`;

    const kontenLinks = shortcodes.map(
      (sc) => `https://www.instagram.com/p/${sc}`
    );
    const likesLists = await Promise.all(
      shortcodes.map((sc) => getLikesByShortcode(sc))
    );
    const likesSets = likesLists.map(
      (likes) => new Set((likes || []).map(normalizeUsername))
    );

    let polresIds;
    let allUsers;
    if (clientFilter) {
      polresIds = [clientFilter.toUpperCase()];
      allUsers = (
        await getUsersByDirektorat(roleName, clientFilter)
      ).filter((u) => u.status === true);
    } else {
      polresIds = (await getClientsByRole(roleName)).map((c) => c.toUpperCase());
    allUsers = (
        await getUsersByDirektorat(roleName, polresIds)
      ).filter((u) => u.status === true);
    }
    const usersByClient = {};
    allUsers.forEach((u) => {
      const cid = u.client_id?.toUpperCase() || "";
      if (!usersByClient[cid]) usersByClient[cid] = [];
      usersByClient[cid].push(u);
    });


    const totalKonten = shortcodes.length;
    const reportEntries = [];
    const totals = { total: 0, sudah: 0, kurang: 0, belum: 0, noUsername: 0 };
    for (let i = 0; i < polresIds.length; i++) {
      const cid = polresIds[i];
      const users = usersByClient[cid] || [];
      const { nama: clientName } = await getClientInfo(cid);
      const sudah = [];
      const kurang = [];
      const belum = [];
      const tanpaUsername = [];
      users.forEach((u) => {
        if (!u.insta || u.insta.trim() === "") {
          tanpaUsername.push(u);
          return;
        }
        const uname = normalizeUsername(u.insta);
        let count = 0;
        likesSets.forEach((set) => {
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
        clientName,
        usersCount: users.length,
        sudahCount: sudah.length,
        kurangCount: kurang.length,
        belumCount,
        noUsernameCount: tanpaUsername.length,
      });
    }

    reportEntries.sort((a, b) => {
      const aBinmas = a.clientName.toUpperCase() === "DIREKTORAT BINMAS";
      const bBinmas = b.clientName.toUpperCase() === "DIREKTORAT BINMAS";
      if (aBinmas && !bBinmas) return -1;
      if (bBinmas && !aBinmas) return 1;
      if (a.sudahCount !== b.sudahCount) return b.sudahCount - a.sudahCount;
      if (a.usersCount !== b.usersCount) return b.usersCount - a.usersCount;
      return a.clientName.localeCompare(b.clientName);
    });

    const reports = reportEntries.map(
      (r, idx) =>
        `${idx + 1}. ${r.clientName}\n\n` +
        `Jumlah Personil : ${r.usersCount} pers\n` +
        `Sudah melaksanakan : ${r.sudahCount} pers\n` +
        `Melaksanakan kurang lengkap : ${r.kurangCount} pers\n` +
        `Belum melaksanakan : ${r.belumCount} pers\n` +
        `Belum Update Username Instagram : ${r.noUsernameCount} pers`
    );

    let msg =
      `Mohon ijin Komandan,\n\n` +
      `📋 Rekap Akumulasi Likes Instagram\n` +
      `Polres: ${clientNama}\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
      `Jumlah Konten: ${totalKonten}\n` +
      `Daftar Link Konten:\n${kontenLinks.length ? kontenLinks.join("\n") : "-"}\n\n` +
      `Jumlah Total Personil : ${totals.total} pers\n` +
      `✅ Sudah melaksanakan : ${totals.sudah} pers\n` +
      `⚠️ Melaksanakan kurang lengkap : ${totals.kurang} pers\n` +
      `❌ Belum melaksanakan : ${totals.belum} pers\n` +
      `Belum Update Username Instagram : ${totals.noUsername} pers\n\n` +
      reports.join("\n\n");
    return msg.trim();
  }

  const users = await getUsersByClient(clientFilter || client_id, roleFlag);
  const targetClient = roleFlag || client_id;
  const shortcodes = await getShortcodesTodayByClient(targetClient);

  if (!shortcodes.length)
    return `Tidak ada konten IG untuk *Polres*: *${clientNama}* hari ini.`;

  const userStats = {};
  users.forEach((u) => {
    userStats[u.user_id] = { ...u, count: 0 };
  });

  const likesLists = await Promise.all(
    shortcodes.map((sc) => getLikesByShortcode(sc))
  );
  likesLists.forEach((likes) => {
    const likesSet = new Set((likes || []).map(normalizeUsername));
    users.forEach((u) => {
      if (
        u.insta &&
        u.insta.trim() !== "" &&
        likesSet.has(normalizeUsername(u.insta))
      ) {
        userStats[u.user_id].count += 1;
      }
    });
  });

  const totalKonten = shortcodes.length;
  // User must like at least 50% of content to be considered complete
  const threshold = Math.ceil(totalKonten * 0.5);
  let sudah = [], belum = [];

  Object.values(userStats).forEach((u) => {
    if (
      u.insta &&
      u.insta.trim() !== "" &&
      u.count >= threshold
    ) {
      sudah.push(u);
    } else {
      belum.push(u);
    }
  });

  const kontenLinks = shortcodes.map(
    (sc) => `https://www.instagram.com/p/${sc}`
  );

  // --- PATCH: Mode support ---
  const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "all";

  // Header: tampilkan jumlah sudah & belum SELALU
  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Akumulasi Likes Instagram*\n*Polres*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
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
              (u.insta ? `@${u.insta.replace(/^@/, "")}` : "-") +
              ` ${ket}`
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
            } else if (u.count > 0 && u.count < threshold) {
              ket = `(${u.count}/${totalKonten} konten)`;
            }
            return (
              `- ${u.title ? u.title + " " : ""}${u.nama} : ` +
              (u.insta ? `@${u.insta.replace(/^@/, "")}` : "-") +
              ` ${ket}`
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

// === PER KONTEN ===
export async function absensiLikesPerKonten(client_id, opts = {}) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const { nama: clientNama } = await getClientInfo(client_id);
  const users = await getUsersByClient(client_id);
  const roleFlag = opts.roleFlag;
  const targetClient = roleFlag || client_id;
  const shortcodes = await getShortcodesTodayByClient(targetClient);

  if (!shortcodes.length)
    return `Tidak ada konten IG untuk *Polres*: *${clientNama}* hari ini.`;

  const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "all";
  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Per Konten Likes Instagram*\n*Polres*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
    `*Jumlah Konten:* ${shortcodes.length}\n`;
  const likesLists = await Promise.all(
    shortcodes.map((sc) => getLikesByShortcode(sc))
  );

  shortcodes.forEach((sc, idx) => {
    const likes = likesLists[idx];
    const likesSet = new Set((likes || []).map(normalizeUsername));
    let userSudah = [];
    let userBelum = [];
    users.forEach((u) => {
      if (
        u.insta &&
        u.insta.trim() !== "" &&
        likesSet.has(normalizeUsername(u.insta))
      ) {
        userSudah.push(u);
      } else {
        userBelum.push(u);
      }
    });

    // Header per konten
    msg += `\nKonten: https://www.instagram.com/p/${sc}\n`;
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
              `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.insta ? `@${u.insta.replace(/^@/, "")}` : "-"}`
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
              `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.insta ? `@${u.insta.replace(/^@/, "")}` : "-"}`
            ).join("\n") + "\n"
          : "-\n";
        if (idx < arr.length - 1) msg += "\n";
      });
      if (Object.keys(belumDiv).length === 0) msg += "-\n";
      msg += "\n";
    }
  });
  msg += `Terimakasih.`;
  return msg.trim();
}

export async function getActiveClientsIG() {
  const res = await query(
    `SELECT client_id, client_insta, client_insta_status
     FROM clients
     WHERE client_status = true
       AND client_insta_status = true
       AND client_insta IS NOT NULL
       AND client_type = 'ORG'`
  );
  return res.rows;
}

export async function rekapLikesIG(client_id) {
  const client = await findClientById(client_id);
  const polresNama = client?.nama || client_id;

  const shortcodes = await getShortcodesTodayByClient(client_id);
  if (!shortcodes.length) return null;

  const likesLists = await Promise.all(
    shortcodes.map((sc) => getLikesByShortcode(sc))
  );
  let totalLikes = 0;
  const detailLikes = likesLists.map((likes, idx) => {
    const jumlahLikes = (likes || []).length;
    totalLikes += jumlahLikes;
    const sc = shortcodes[idx];
    return {
      shortcode: sc,
      link: `https://www.instagram.com/p/${sc}`,
      jumlahLikes,
    };
  });

  let msg =
    "Mohon Ijin Komandan, Senior, Rekan Operator dan Personil pelaksana Tugas Likes dan komentar Sosial Media Ditbinmas.\n\n" +
    "Tugas Likes dan Komentar Konten IG\n" +
    `${polresNama.toUpperCase()}\n` +
    `Jumlah konten hari ini: ${shortcodes.length}\n` +
    `Total likes semua konten: ${totalLikes}\n\n` +
    "Rincian:\n";

  detailLikes.forEach((d) => {
    msg += `- ${d.link} : ${d.jumlahLikes} like\n`;
  });

  msg += "\nSilahkan Melaksanakan Likes, Komentar dan Share.";

  return msg.trim();
}

export async function absensiLikesDitbinmasReport() {
  const roleName = "ditbinmas";
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const shortcodes = await getShortcodesTodayByClient(roleName);
  if (!shortcodes.length)
    return "Tidak ada konten IG untuk DIREKTORAT BINMAS hari ini.";

  const kontenLinks = shortcodes.map(
    (sc) => `https://www.instagram.com/p/${sc}`
  );
  const likesLists = await Promise.all(
    shortcodes.map((sc) => getLikesByShortcode(sc))
  );
  const likesSets = likesLists.map(
    (likes) => new Set((likes || []).map(normalizeUsername))
  );

  const allUsers = (
    await getUsersByDirektorat(roleName, "DITBINMAS")
  ).filter((u) => u.status === true);

  const already = [];
  const partial = [];
  const none = [];
  const noUsername = [];

  allUsers.forEach((u) => {
    if (!u.insta || u.insta.trim() === "") {
      noUsername.push(u);
      return;
    }
    const uname = normalizeUsername(u.insta);
    let count = 0;
    likesSets.forEach((set) => {
      if (set.has(uname)) count += 1;
    });
    if (count === shortcodes.length) already.push({ ...u, count });
    else if (count > 0) partial.push({ ...u, count });
    else none.push({ ...u, count });
  });

  const totals = {
    total: allUsers.length,
    sudah: already.length + partial.length,
    kurang: partial.length,
    belum: none.length + noUsername.length,
    noUsername: noUsername.length,
  };

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
  const sortUsers = (arr) =>
    arr.sort(
      (a, b) =>
        rankIdx(a.title) - rankIdx(b.title) ||
        formatNama(a).localeCompare(formatNama(b))
    );

  sortUsers(already);
  sortUsers(partial);
  sortUsers(none);
  sortUsers(noUsername);

  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 Rekap Akumulasi Likes Instagram\n` +
    `DIREKTORAT BINMAS\n` +
    `${hari}, ${tanggal}\n` +
    `Jam: ${jam}\n\n` +
    `Jumlah Konten: ${shortcodes.length}\n` +
    `Daftar Link Konten:\n${kontenLinks.join("\n")}\n\n` +
    `Jumlah Total Personil : ${totals.total} pers\n` +
    `✅ Sudah melaksanakan : ${totals.sudah} pers\n` +
    `⚠️ Melaksanakan kurang lengkap : ${totals.kurang} pers\n` +
    `❌ Belum melaksanakan : ${totals.belum} pers\n` +
    `❌❌Belum Update Username Instagram : ${totals.noUsername} pers\n\n` +
    `✅Likes Lengkap: ${already.length}\n` +
    (already.length
      ? already.map((u) => `- ${formatNama(u)}, ${u.count}`).join("\n") + "\n"
      : "-\n\n") +
    `⚠️Likes Kurang: ${partial.length}\n` +
    (partial.length
      ? partial.map((u) => `- ${formatNama(u)}, ${u.count}`).join("\n") + "\n"
      : "-\n\n") +
    `❌Belum Likes : ${none.length}\n` +
    (none.length
      ? none
          .map((u) => `- ${formatNama(u)}, ${u.insta || "-"}`)
          .join("\n") + "\n"
      : "-\n\n") +
    `❌❌Belum Input Sosial media : ${noUsername.length}\n` +
    (noUsername.length
      ? noUsername
          .map(
            (u) =>
              `- ${formatNama(u)}, IG Kosong${!u.tiktok ? ", Tiktok Kosong" : ""}`
          )
          .join("\n")
      : "-");

  return msg.trim();
}

export async function lapharDitbinmas() {
  const roleName = "ditbinmas";
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });
  const dateSafe = tanggal.replace(/\//g, "-");
  const timeSafe = jam.replace(/[:.]/g, "-");
  const filename = `Absensi_All_Engagement_Instagram_${hari}_${dateSafe}_${timeSafe}.txt`;
  const filenameBelum = `Absensi_Belum_Engagement_Instagram_${hari}_${dateSafe}_${timeSafe}.txt`;

  const shortcodes = await getShortcodesTodayByClient(roleName);
  if (!shortcodes.length)
    return { filename, text: "Tidak ada konten IG untuk DIREKTORAT BINMAS hari ini." };

  const kontenLinks = shortcodes.map(
    (sc) => `https://www.instagram.com/p/${sc}`
  );
  const likesLists = await Promise.all(
    shortcodes.map((sc) => getLikesByShortcode(sc))
  );
  const likesSets = likesLists.map(
    (likes) => new Set((likes || []).map(normalizeUsername))
  );
  const likesCounts = likesSets.map((set) => set.size);

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

  const kontenLinkLikes = kontenLinks.map(
    (link, idx) => `${link} : ${likesCounts[idx]}`
  );

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
      if (!u.tiktok) noTiktok++;
      if (!u.insta || u.insta.trim() === "") {
        noUname.push(u);
        return;
      }
      const uname = normalizeUsername(u.insta);
      let count = 0;
      likesSets.forEach((set) => {
        if (set.has(uname)) count += 1;
      });
      if (count === shortcodes.length) already.push({ ...u, count });
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

    const likeSum =
      already.reduce((acc, u) => acc + (u.count || 0), 0) +
      partial.reduce((acc, u) => acc + (u.count || 0), 0);

    const blockLines = [
      `*${clientName.toUpperCase()}* : ${users.length} / ${already.length} / ${partial.length} / ${
        none.length + noUname.length
      } / ${noUname.length} / ${noTiktok}`,
      `Sudah Likes : ${already.length}`,
      ...already.map((u) => `- ${formatNama(u)}, ${u.count}`),
    ];

    blockLines.push("");
    blockLines.push(`Kurang likes : ${partial.length}`);
    if (partial.length) {
      blockLines.push(...partial.map((u) => `- ${formatNama(u)}, ${u.count}`));
    }

    blockLines.push("");
    blockLines.push(`Belum Likes : ${none.length}`);
    if (none.length) {
      blockLines.push("");
      blockLines.push(...none.map((u) => `- ${formatNama(u)}, ${u.insta}`));
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
      likes: likeSum,
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
        belumLines.push(`Belum Likes : ${none.length}`);
        belumLines.push(...none.map((u) => `- ${formatNama(u)}, ${u.insta}`));
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
    if (a.likes !== b.likes) return b.likes - a.likes;
    return a.name.localeCompare(b.name);
  });

  const perClientBlocks = perClientStats.map((p) => p.block);
  const totalLikes = perClientStats.reduce((acc, p) => acc + p.likes, 0);
  const totalPossibleLikes = totals.total * shortcodes.length;
  const likePercent = totalPossibleLikes
    ? (totalLikes / totalPossibleLikes) * 100
    : 0;
  const targetLikes = Math.ceil(totalPossibleLikes * 0.95);
  const deficit = targetLikes - totalLikes;

  const topContribArr = [...perClientStats]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 4);
  const topContrib = topContribArr
    .map((p) => `${p.name} ${p.likes}`)
    .join(", ");
  const topContribPercent = totalLikes
    ? (
        (topContribArr.reduce((acc, p) => acc + p.likes, 0) / totalLikes) *
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
  const igOverallPercent = totals.total
    ? (igUpdated / totals.total) * 100
    : 0;
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

  const text =
    `Mohon ijin Komandan,\n\n` +
    `📋 Rekap Akumulasi Likes Instagram\n` +
    `Polres: DIREKTORAT BINMAS\n` +
    `${hari}, ${tanggal}\n` +
    `Jam: ${jam}\n\n` +
    `Jumlah Konten: ${shortcodes.length}\n` +
    `Daftar Link Konten:\n${kontenLinks.map((l) => `- ${l}`).join("\n")}\n\n` +
    `Jumlah Total Personil : ${totals.total} pers\n` +
    `Total Sudah Melaksanakan Likes : ${totals.sudah+totals.kurang} pers\n` +
    `- Melaksanakan Likes Lengkap : ${totals.sudah} pers\n` +
    `- Melaksanakan Likes Kurang lengkap : ${totals.kurang} pers\n` +
    `Belum Melaksanakan : ${totals.belum} pers\n` +
    `Belum Update Username Instagram : ${totals.noUsername} pers\n` +
    `_Kesatuan  :  Jumlah user / Sudah likes / Likes kurang/ Belum likes/ Belum input IG _\n` +
    `${perClientBlocks.join("\n\n")}`;

  const narrative =
    `Mohon Ijin Komandan, melaporkan perkembangan Implementasi Update data dan Absensi likes oleh personil hari ${hari}, ${tanggal} pukul ${jam} WIB.\n\n` +
    `DIREKTORAT BINMAS\n\n` +
    `Konten hari ini: ${shortcodes.length} link: ${kontenLinkLikes.join(", ")}\n\n` +
    `Kinerja Likes konten: ${totalLikes}/${totalPossibleLikes} (${likePercent.toFixed(2)}%)\n` +
    `Target harian ≥95% = ${targetLikes} likes${deficit > 0 ? ` → kekurangan ${deficit}` : ""}\n\n` +
    `Kontributor likes terbesar (konten hari ini):\n${topContrib ? `${topContrib} → menyumbang ${topContribPercent}% dari total likes saat ini.` : "-"}\n\n` +
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

  const textBelum =
    `Belum melaksanakan Likes atau belum input username IG/Tiktok\n` +
    `Polres: DIREKTORAT BINMAS\n` +
    `${hari}, ${tanggal}\n` +
    `Jam: ${jam}\n\n` +
    `${perClientBelumBlocks.join("\n\n")}`;

  return {
    filename,
    text: text.trim(),
    narrative,
    filenameBelum,
    textBelum: textBelum.trim(),
  };
}
