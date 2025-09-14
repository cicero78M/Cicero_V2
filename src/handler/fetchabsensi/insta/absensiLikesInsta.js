import { query } from "../../../db/index.js";
import { getUsersByClient } from "../../../model/userModel.js";
import { getShortcodesTodayByClient } from "../../../model/instaPostModel.js";
import { hariIndo } from "../../../utils/constants.js";
import {
  groupByDivision,
  sortDivisionKeys,
  formatNama,
} from "../../../utils/utilsHelper.js";
import { findClientById } from "../../../service/clientService.js";
import {
  normalizeUsername,
  getLikesSets,
  groupUsersByClientDivision,
} from "../../../utils/likesHelper.js";
import { getClientInfo } from "../../../service/instagram/instagramReport.js";

export async function collectLikesRecap(clientId, opts = {}) {
  const roleName = String(clientId || "").toLowerCase();
  const shortcodes = await getShortcodesTodayByClient(clientId);
  const likesSets = await getLikesSets(shortcodes);
  const { polresIds, usersByClient } = await groupUsersByClientDivision(
    roleName,
    { selfOnly: opts.selfOnly }
  );
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
    const likesSets = await getLikesSets(shortcodes);
    const { polresIds, usersByClient } = await groupUsersByClientDivision(
      roleName,
      { clientFilter }
    );


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

  const likesSets = await getLikesSets(shortcodes);
  likesSets.forEach((likesSet) => {
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
  const likesSets = await getLikesSets(shortcodes);

  shortcodes.forEach((sc, idx) => {
    const likesSet = likesSets[idx];
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
  const likesSets = await getLikesSets(shortcodes);
  let totalLikes = 0;
  const detailLikes = likesSets.map((set, idx) => {
    const jumlahLikes = set.size;
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
  const likesSets = await getLikesSets(shortcodes);
  const { usersByClient } = await groupUsersByClientDivision(roleName, {
    clientFilter: "DITBINMAS",
  });
  const allUsers = usersByClient["DITBINMAS"] || [];

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

export { lapharDitbinmas } from "../../../service/instagram/instagramReport.js";
