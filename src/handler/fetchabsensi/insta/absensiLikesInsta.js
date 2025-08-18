import { query } from "../../../db/index.js";
import {
  getUsersByClient,
  getUsersByDirektorat,
  getClientsByRole,
} from "../../../model/userModel.js";
import { getShortcodesTodayByClient } from "../../../model/instaPostModel.js";
import { getLikesByShortcode } from "../../../model/instaLikeModel.js";
import { hariIndo } from "../../../utils/constants.js";
import { groupByDivision, sortDivisionKeys } from "../../../utils/utilsHelper.js";
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
    "SELECT nama, client_type FROM clients WHERE client_id = $1 LIMIT 1",
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
  const targetClient = clientFilter || client_id;
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const { nama: clientNama, clientType } = await getClientInfo(targetClient);

  if (clientType === "direktorat") {
    const roleName = (roleFlag || targetClient).toLowerCase();
    const polresIds = (await getClientsByRole(roleName)).map((c) =>
      c.toUpperCase()
    );
    const shortcodes = await getShortcodesTodayByClient(roleName);
    if (!shortcodes.length)
      return `Tidak ada konten IG untuk *${clientNama}* hari ini.`;

    const kontenLinks = shortcodes.map(
      (sc) => `https://www.instagram.com/p/${sc}`
    );
    const likesSets = [];
    for (const sc of shortcodes) {
      const likes = await getLikesByShortcode(sc);
      likesSets.push(new Set((likes || []).map(normalizeUsername)));
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

    const totalKonten = shortcodes.length;
    const threshold = Math.ceil(totalKonten * 0.5);
    const reports = [];
    for (const cid of polresIds) {
      const users = usersByClient[cid] || [];
      const { nama: polresNama } = await getClientInfo(cid);
      const sudah = [];
      const belum = [];
      const noUsername = [];
      users.forEach((u) => {
        if (u.exception === true) {
          sudah.push(u);
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
        if (count >= threshold) sudah.push(u);
        else belum.push(u);
      });
      reports.push(
        `*Polres*: *${polresNama}*\n` +
          `*Jumlah user:* ${users.length}\n` +
          `✅ *Sudah melaksanakan* : *${sudah.length} user*\n` +
          `❌ *Belum melaksanakan* : *${belum.length} user*\n` +
          `⚠️ *Belum input username* : *${noUsername.length} user*`
      );
    }

    let msg =
      `Mohon ijin Komandan,\n\n` +
      `📋 *Rekap Akumulasi Likes Instagram*\n*Direktorat*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
      `*Jumlah Konten:* ${totalKonten}\n` +
      `*Daftar Link Konten:*\n${kontenLinks.length ? kontenLinks.join("\n") : "-"}\n\n` +
      reports.join("\n\n") +
      "\n\nTerimakasih.";
    return msg.trim();
  }

  let users;
  if (
    roleFlag &&
    typeof roleFlag === "string" &&
    roleFlag.toUpperCase() === targetClient.toUpperCase()
  ) {
    users = (await getUsersByDirektorat(roleFlag.toLowerCase(), targetClient)).filter(
      (u) => u.status === true
    );
  } else {
    users = await getUsersByClient(targetClient);
  }
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
  const shortcodes = await getShortcodesTodayByClient(client_id);

  if (!shortcodes.length)
    return `Tidak ada konten IG untuk *Polres*: *${clientNama}* hari ini.`;

  const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "all";
  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Per Konten Likes Instagram*\n*Polres*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
    `*Jumlah Konten:* ${shortcodes.length}\n`;

  for (const sc of shortcodes) {
    const likes = await getLikesByShortcode(sc);
    const likesSet = new Set((likes || []).map(normalizeUsername));
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
  let detailLikes = [];
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
    `📊 Rekap Likes IG\n*Polres*: *${polresNama}*\n` +
    `Jumlah konten hari ini: *${shortcodes.length}*\n` +
    `Total likes semua konten: *${totalLikes}*\n\n` +
    `Rincian:\n`;
  detailLikes.forEach((d) => {
    msg += `- ${d.link}: ${d.jumlahLikes} like\n`;
  });
  return msg.trim();
}
