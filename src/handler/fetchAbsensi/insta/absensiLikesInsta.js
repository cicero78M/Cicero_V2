import { pool } from "../../../config/db.js";
import { getUsersByClient } from "../../../model/userModel.js";
import { getShortcodesTodayByClient } from "../../../model/instaPostModel.js";
import { getLikesByShortcode } from "../../../model/instaLikeModel.js";
import { hariIndo } from "../../../utils/constants.js";
import { sortDivisionKeys, groupByDivision } from "../../../utils/utilsHelper.js";

// Custom sorting satfung helper (urutan tetap BAG, SAT, SI, POLSEK)
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

async function getClientNama(client_id) {
  const res = await pool.query(
    "SELECT nama FROM clients WHERE client_id = $1 LIMIT 1",
    [client_id]
  );
  return res.rows[0]?.nama || client_id;
}

// === AKUMULASI ===
export async function absensiLikes(client_id, opts = {}) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const clientNama = await getClientNama(client_id);
  const users = await getUsersByClient(client_id);
  const shortcodes = await getShortcodesTodayByClient(client_id);

  if (!shortcodes.length)
    return `Tidak ada konten IG untuk *Polres*: *${clientNama}* hari ini.`;

  const userStats = {};
  users.forEach((u) => {
    userStats[u.user_id] = { ...u, count: 0 };
  });

  for (const shortcode of shortcodes) {
    const likes = await getLikesByShortcode(shortcode);
    const likesSet = new Set((likes || []).map((x) => (x || "").toLowerCase()));
    users.forEach((u) => {
      if (
        u.insta &&
        u.insta.trim() !== "" &&
        likesSet.has(u.insta.toLowerCase())
      ) {
        userStats[u.user_id].count += 1;
      }
    });
  }

  const totalKonten = shortcodes.length;
  let sudah = [], belum = [];

  Object.values(userStats).forEach((u) => {
    if (u.exception === true) {
      sudah.push(u); // selalu masuk ke sudah!
    } else if (
      u.insta &&
      u.insta.trim() !== "" &&
      u.count >= Math.ceil(totalKonten / 2)
    ) {
      sudah.push(u);
    } else {
      belum.push(u);
    }
  });

  // Hapus user exception dari list belum!
  belum = belum.filter(u => !u.exception);

  const kontenLinks = shortcodes.map(
    (sc) => `https://www.instagram.com/p/${sc}`
  );

  // --- PATCH: Mode support ---
  const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "all";
  let msg =
    `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar dan Likes pada Akun Official:\n\n` +
    `📋 Rekap Akumulasi Likes IG\n*Polres*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
    `*Jumlah Konten:* ${totalKonten}\n` +
    `*Daftar Link Konten:*\n${kontenLinks.join("\n")}\n\n` +
    `*Jumlah user:* ${users.length}\n`;

  if (mode === "all" || mode === "sudah") {
    msg += `✅ Sudah melaksanakan: *${sudah.length}*\n`;
    // Selalu tampilkan list user sudah!
    msg += `\n✅ Sudah melaksanakan (${sudah.length} user):\n`;
    const sudahDiv = groupByDivision(sudah);
    sortSatfung(Object.keys(sudahDiv)).forEach((div) => {
      const list = sudahDiv[div];
      msg += `*${div}* (${list.length} user):\n`;
      msg +=
        list
          .map((u) => {
            let ket = "";
            if (u.count) ket = `sudah melaksanakan ${u.count} dari ${totalKonten} konten`;
            return (
              `- ${u.title ? u.title + " " : ""}${u.nama} : ` +
              `${u.insta ? u.insta : "belum mengisi data insta"}` +
              (ket ? ` (${ket})` : "")
            );
          })
          .join("\n") + "\n\n";
    });
    if (Object.keys(sudahDiv).length === 0) msg += "-\n\n";
  }
  if (mode === "all" || mode === "belum") {
    msg += `❌ Belum melaksanakan: *${belum.length}*\n`;
    // Selalu tampilkan list user belum!
    msg += `\n❌ Belum melaksanakan (${belum.length} user):\n`;
    const belumDiv = groupByDivision(belum);
    sortSatfung(Object.keys(belumDiv)).forEach((div) => {
      const list = belumDiv[div];
      msg += `*${div}* (${list.length} user):\n`;
      msg +=
        list
          .map((u) => {
            let ket = "";
            if (!u.count || u.count === 0) {
              ket = `sudah melaksanakan 0 dari ${totalKonten} konten`;
            } else if (u.count > 0 && u.count < Math.ceil(totalKonten / 2)) {
              ket = `sudah melaksanakan ${u.count} dari ${totalKonten} konten`;
            }
            return (
              `- ${u.title ? u.title + " " : ""}${u.nama} : ` +
              `${u.insta ? u.insta : "belum mengisi data insta"}` +
              (ket ? ` (${ket})` : "")
            );
          })
          .join("\n") + "\n\n";
    });
    if (Object.keys(belumDiv).length === 0) msg += "-\n\n";
  }
  msg += `\nTerimakasih.`;

  return msg.trim();
}

// === PER KONTEN ===
export async function absensiLikesPerKonten(client_id, opts = {}) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const clientNama = await getClientNama(client_id);
  const users = await getUsersByClient(client_id);
  const shortcodes = await getShortcodesTodayByClient(client_id);

  if (!shortcodes.length)
    return `Tidak ada konten IG untuk *Polres*: *${clientNama}* hari ini.`;

  const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "all";
  let msg =
    `Mohon Ijin Komandan,\n\nRekap Per Konten Likes IG\n*Polres*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
    `*Jumlah Konten:* ${shortcodes.length}\n`;

  for (const sc of shortcodes) {
    const likes = await getLikesByShortcode(sc);
    const likesSet = new Set((likes || []).map((x) => (x || "").toLowerCase()));
    let userSudah = [];
    let userBelum = [];
    users.forEach((u) => {
      if (u.exception === true) {
        userSudah.push(u); // Selalu ke sudah!
      } else if (u.insta && u.insta.trim() !== "" && likesSet.has(u.insta.toLowerCase())) {
        userSudah.push(u);
      } else {
        userBelum.push(u);
      }
    });
    // Hilangkan user exception dari belum!
    userBelum = userBelum.filter(u => !u.exception);

    msg += `\nKonten: https://www.instagram.com/p/${sc}\n`;

    if (mode === "all" || mode === "sudah") {
      msg += `✅ Sudah: ${userSudah.length}\n`;
      // Group by divisi, urutkan satfung
      const sudahDiv = groupByDivision(userSudah);
      sortSatfung(Object.keys(sudahDiv)).forEach((div) => {
        const list = sudahDiv[div];
        msg += `*${div}* (${list.length} user):\n`;
        msg += list.length
          ? list.map(u =>
              `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.insta || "-"}`
            ).join("\n") + "\n"
          : "-\n";
      });
      if (Object.keys(sudahDiv).length === 0) msg += "-\n";
    }

    if (mode === "all" || mode === "belum") {
      msg += `❌ Belum: ${userBelum.length}\n`;
      const belumDiv = groupByDivision(userBelum);
      sortSatfung(Object.keys(belumDiv)).forEach((div) => {
        const list = belumDiv[div];
        msg += list.length
          ? `*${div}* (${list.length} user):\n` +
            list.map(u =>
              `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.insta || "-"}`
            ).join("\n") + "\n"
          : "-\n";
      });
      if (Object.keys(belumDiv).length === 0) msg += "-\n";
    }
  }
  msg += `\nTerimakasih.`;
  return msg.trim();
}
