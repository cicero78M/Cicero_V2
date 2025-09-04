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

    const kontenLinks = shortcodes.map((sc) => `https://www.instagram.com/p/${sc}`);
    const likesSets = [];
    for (const sc of shortcodes) {
      const likes = await getLikesByShortcode(sc);
      likesSets.push(new Set((likes || []).map(normalizeUsername)));
    }

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

    const exceptionUsernames = allUsers
      .filter(
        (u) =>
          u.exception === true &&
          u.insta &&
          u.insta.trim() !== ""
      )
      .map((u) => normalizeUsername(u.insta));
    likesSets.forEach((set) => {
      exceptionUsernames.forEach((uname) => set.add(uname));
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
        if (u.exception === true) {
          sudah.push(u);
          return;
        }
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

  for (const shortcode of shortcodes) {
    const likes = await getLikesByShortcode(shortcode);
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
  }

  const totalKonten = shortcodes.length;
  // User must like at least 50% of content to be considered complete
  const threshold = Math.ceil(totalKonten * 0.5);
  let sudah = [], belum = [];

  Object.values(userStats).forEach((u) => {
    if (u.exception === true) {
      sudah.push(u); // selalu masuk ke sudah!
    } else if (
      u.insta &&
      u.insta.trim() !== "" &&
      u.count >= threshold
    ) {
      sudah.push(u);
    } else {
      belum.push(u);
    }
  });

  // Hapus user exception dari list belum!
  belum = belum.filter((u) => !u.exception);

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

  const exceptionUsernames = users
    .filter(
      (u) =>
        u.exception === true &&
        u.insta &&
        u.insta.trim() !== ""
    )
    .map((u) => normalizeUsername(u.insta));

  for (const sc of shortcodes) {
    const likes = await getLikesByShortcode(sc);
    const likesSet = new Set((likes || []).map(normalizeUsername));
    exceptionUsernames.forEach((uname) => likesSet.add(uname));
    let userSudah = [];
    let userBelum = [];
    users.forEach((u) => {
      if (u.exception === true) {
        userSudah.push(u); // Selalu ke sudah!
      } else if (u.insta && u.insta.trim() !== "" && likesSet.has(normalizeUsername(u.insta))) {
        userSudah.push(u);
      } else {
        userBelum.push(u);
      }
    });
    // Hilangkan user exception dari belum!
    userBelum = userBelum.filter(u => !u.exception);

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
  }
  msg += `Terimakasih.`;
  return msg.trim();
}

export async function getActiveClientsIG() {
  const res = await query(
    `SELECT client_id, client_insta, client_insta_status, client_amplify_status
     FROM clients
     WHERE client_status = true
       AND (client_insta_status = true OR client_amplify_status = true)
       AND client_insta IS NOT NULL`
  );
  return res.rows;
}

export async function rekapLikesIG(client_id) {
  const client = await findClientById(client_id);
  const polresNama = client?.nama || client_id;

  const shortcodes = await getShortcodesTodayByClient(client_id);
  if (!shortcodes.length) return null;

  let totalLikes = 0;
  const detailLikes = [];
  for (const sc of shortcodes) {
    const likes = await getLikesByShortcode(sc);
    const jumlahLikes = (likes || []).length;
    totalLikes += jumlahLikes;
    detailLikes.push({
      shortcode: sc,
      link: `https://www.instagram.com/p/${sc}`,
      jumlahLikes,
    });
  }

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
  const likesSets = [];
  for (const sc of shortcodes) {
    const likes = await getLikesByShortcode(sc);
    likesSets.push(new Set((likes || []).map(normalizeUsername)));
  }

  const allUsers = (
    await getUsersByDirektorat(roleName, "DITBINMAS")
  ).filter((u) => u.status === true);

  const already = [];
  const partial = [];
  const none = [];
  const noUsername = [];

  allUsers.forEach((u) => {
    if (u.exception === true) {
      already.push({ ...u, count: shortcodes.length });
      return;
    }
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
    `Polres: DIREKTORAT BINMAS\n` +
    `${hari}, ${tanggal}\n` +
    `Jam: ${jam}\n\n` +
    `Jumlah Konten: ${shortcodes.length}\n` +
    `Daftar Link Konten:\n${kontenLinks.join("\n")}\n\n` +
    `Jumlah Total Personil : ${totals.total} pers\n` +
    `✅ Sudah melaksanakan : ${totals.sudah} pers\n` +
    `⚠️ Melaksanakan kurang lengkap : ${totals.kurang} pers\n` +
    `❌ Belum melaksanakan : ${totals.belum} pers\n` +
    `❌❌Belum Update Username Instagram : ${totals.noUsername} pers\n\n` +
    `✅Sudah Likes : ${already.length}\n` +
    (already.length
      ? already.map((u) => `- ${formatNama(u)}, ${u.count}`).join("\n") + "\n\n"
      : "-\n\n") +
    `⚠️Kurang likes : ${partial.length}\n` +
    (partial.length
      ? partial.map((u) => `- ${formatNama(u)}, ${u.count}`).join("\n") + "\n\n"
      : "-\n\n") +
    `❌Belum Likes : ${none.length}\n` +
    (none.length
      ? none
          .map((u) => `- ${formatNama(u)}, ${u.insta || "-"}`)
          .join("\n") + "\n\n"
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
  const filename = `Absensi_All_Likes_IG_Ditbinmas_${hari}_${dateSafe}_${timeSafe}.txt`;
  const filenameBelum = `Absensi_Belum_Likes_IG_Ditbinmas_${hari}_${dateSafe}_${timeSafe}.txt`;

  const shortcodes = await getShortcodesTodayByClient(roleName);
  if (!shortcodes.length)
    return { filename, text: "Tidak ada konten IG untuk DIREKTORAT BINMAS hari ini." };

  const kontenLinks = [];
  const likesSets = [];
  const likesCounts = [];
  for (const sc of shortcodes) {
    const link = `https://www.instagram.com/p/${sc}`;
    kontenLinks.push(link);
    const likes = await getLikesByShortcode(sc);
    const likeSet = new Set((likes || []).map(normalizeUsername));
    likesSets.push(likeSet);
    likesCounts.push(likeSet.size);
  }

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

  const exceptionUsernames = allUsers
    .filter(
      (u) =>
        u.exception === true &&
        u.insta &&
        u.insta.trim() !== ""
    )
    .map((u) => normalizeUsername(u.insta));
  likesSets.forEach((set, idx) => {
    exceptionUsernames.forEach((uname) => set.add(uname));
    likesCounts[idx] = set.size;
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

  const topIg = [...perClientStats]
    .sort((a, b) => b.igPercent - a.igPercent)
    .slice(0, 5)
    .map((p) => `${p.name} ${p.igPercent.toFixed(1)}%`)
    .join(", ");
  const topTiktok = [...perClientStats]
    .sort((a, b) => b.tiktokPercent - a.tiktokPercent)
    .slice(0, 5)
    .map((p) => `${p.name} ${p.tiktokPercent.toFixed(1)}%`)
    .join(", ");

  const zeroIg = perClientStats
    .filter((p) => p.igPercent === 0)
    .map((p) => p.name);
  const zeroTiktok = perClientStats
    .filter((p) => p.tiktokPercent === 0)
    .map((p) => p.name);

  const seg70 = perClientStats.filter((p) => p.igPercent >= 70).length;
  const seg50 = perClientStats.filter(
    (p) => p.igPercent >= 50 && p.igPercent < 70
  ).length;
  const seg10 = perClientStats.filter(
    (p) => p.igPercent >= 10 && p.igPercent < 50
  ).length;
  const seg0 = perClientStats.filter((p) => p.igPercent < 10).length;

  const topNoUsername = [...perClientStats]
    .filter((p) => p.noUsername > 0)
    .sort((a, b) => b.noUsername - a.noUsername)
    .slice(0, 6)
    .map((p) => `${p.name} ${p.noUsername}`)
    .join(", ");

  const anomalies = perClientStats
    .filter((p) => {
      const updated = p.totalUsers - p.noUsername;
      const possible = updated * shortcodes.length;
      const likePct = possible ? (p.likes / possible) * 100 : 0;
      return p.igPercent >= 80 && likePct < 10;
    })
    .map((p) => {
      const updated = p.totalUsers - p.noUsername;
      return `${p.name}: IG ${updated}/${p.totalUsers} (${p.igPercent.toFixed(
        1
      )}%) namun likes konten hanya ${p.likes}${
        p.noUsername
          ? ` dan "Belum Update Data" tercatat ${p.noUsername}`
          : ""
      }`;
    });

  const igUpdatePercent = (
    ((totals.total - totals.noUsername) / totals.total) * 100 || 0
  ).toFixed(2);
  const tiktokUpdatePercent = (
    ((totals.total - totals.noTiktok) / totals.total) * 100 || 0
  ).toFixed(2);
  const noUsernamePercent = (
    (totals.noUsername / totals.total) * 100 || 0
  ).toFixed(2);

  const text =
    `Mohon ijin Komandan,\n\n` +
    `📋 Rekap Akumulasi Likes Instagram\n` +
    `Polres: DIREKTORAT BINMAS\n` +
    `${hari}, ${tanggal}\n` +
    `Jam: ${jam}\n\n` +
    `Jumlah Konten: ${shortcodes.length}\n` +
    `Daftar Link Konten:\n${kontenLinks.map((l) => `- ${l}`).join("\n")}\n\n` +
    `Jumlah Total Personil : ${totals.total} pers\n` +
    `Sudah melaksanakan : ${totals.sudah} pers\n` +
    `Melaksanakan kurang lengkap : ${totals.kurang} pers\n` +
    `Belum melaksanakan : ${totals.belum} pers\n` +
    `Belum Update Username Instagram : ${totals.noUsername} pers\n` +
    `Belum Update Username Tiktok : ${totals.noTiktok} pers\n\n` +
    `_Kesatuan  :  Jumlah user / Sudah likes / Likes kurang/ Belum likes/ Belum input IG / Belum input TikTok_\n` +
    `${perClientBlocks.join("\n\n")}`;

  const narrative =
    `Mohon Ijin Komandan, melaporkan perkembangan Implementasi Update data dan Absensi likes oleh personil hari ${hari}, ${tanggal} pukul ${jam} WIB.\n\n` +
    `DIREKTORAT BINMAS\n\n` +
    `Konten hari ini: ${shortcodes.length} link: ${kontenLinkLikes.join(", " )}\n\n` +
    `Kinerja Likes konten: ${totalLikes}/${totalPossibleLikes} (${likePercent.toFixed(
      2
    )}%)\n` +
    `Target harian ≥95% = ${targetLikes} likes${
      deficit > 0 ? ` → kekurangan ${deficit}` : ""
    }\n\n` +
    `Kontributor likes terbesar (konten hari ini):\n${
      topContrib
        ? `${topContrib} → menyumbang ${topContribPercent}% dari total likes saat ini.`
        : "-"
    }\n\n` +
    `Absensi Update Data\n\n` +
    `· IG: ${totals.total - totals.noUsername}/${totals.total} (${igUpdatePercent}%)\n` +
    `· TikTok: ${totals.total - totals.noTiktok}/${totals.total} (${tiktokUpdatePercent}%)\n` +
    `· Belum update data: ${totals.noUsername} (${noUsernamePercent}%)\n\n` +
    `Pendorong & Tertinggal\n\n` +
    `IG (persentase update username tertinggi):\n${topIg || "-"}.\n\n` +
    `TikTok (persentase update tertinggi):\n${topTiktok || "-"}.\n\n` +
    `Satuan 0% (belum ada update):\nIG (${zeroIg.length}): ${
      zeroIg.length ? zeroIg.join(", ") : "-"
    }.\nTikTok (${zeroTiktok.length}): ${
      zeroTiktok.length ? zeroTiktok.join(", ") : "-"
    }.\n\n` +
    `Segmentasi Capaian (IG)\n\n` +
    `≥70%: ${seg70} satker\n\n` +
    `50–69%: ${seg50} satker\n\n` +
    `10–49%: ${seg10} satker\n\n` +
    `<10%: ${seg0} satker${
      zeroIg.length ? ` (termasuk ${zeroIg.length} yang 0%)` : ""
    }\n\n` +
    `Belum Update Data: ${topNoUsername || "-"}.\n\n` +
    `Anomali :\n${anomalies.length ? anomalies.join("\n") : "nihil"}\n\n` +
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
