import { pool } from "../../../config/db.js";
import { getUsersByClient } from "../../../model/userModel.js";
import { getShortcodesTodayByClient } from "../../../model/instaPostModel.js";
import { getLikesByShortcode } from "../../../model/instaLikeModel.js";
import { hariIndo } from "../../../utils/constants.js";
import { sortDivisionKeys, groupByDivision } from "../../../utils/utilsHelper.js";

/**
 * Ambil nama client dari DB, fallback ke client_id jika tidak ditemukan
 */
async function getClientNama(client_id) {
  const res = await pool.query(
    "SELECT nama FROM clients WHERE client_id = $1 LIMIT 1",
    [client_id]
  );
  return res.rows[0]?.nama || client_id;
}

export async function getActiveClientsIG() {
  const res = await pool.query(
    `SELECT client_id, client_insta FROM clients WHERE client_status = true AND client_insta_status = true AND client_insta IS NOT NULL`
  );
  return res.rows;
}

/**
 * Handler utama absensi likes IG (mode: all, sudah, belum)
 * @param {string} client_id
 * @param {object} opts - opsi { mode: "all"|"sudah"|"belum" }
 */
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
      sudah.push(u);
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

  // filter kembali, agar TIDAK ADA user exception di list belum!
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
    sortDivisionKeys(Object.keys(sudahDiv)).forEach((div) => {
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
    sortDivisionKeys(Object.keys(belumDiv)).forEach((div) => {
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

/**
 * Rekap Likes IG (total likes semua konten hari ini, pakai nama client)
 */
export async function rekapLikesIG(client_id) {
  const clientNama = await getClientNama(client_id);
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
    `📊 Rekap Likes IG\n*Polres*: *${clientNama}*\n` +
    `Jumlah konten hari ini: ${shortcodes.length}\n` +
    `Total likes semua konten: ${totalLikes}\n\n` +
    `Rincian:\n`;
  detailLikes.forEach((d) => {
    msg += `${d.link}: ${d.jumlahLikes} like\n`;
  });
  return msg.trim();
}

/**
 * Absensi per konten, breakdown sudah/belum per konten.
 * mode: all | sudah | belum
 */
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
      if (u.insta && u.insta.trim() !== "" && likesSet.has(u.insta.toLowerCase())) {
        userSudah.push(u);
      } else {
        userBelum.push(u);
      }
    });
    msg += `\nKonten: https://www.instagram.com/p/${sc}\n`;
    if (mode === "all" || mode === "sudah") {
      msg += `✅ Sudah: ${userSudah.length}\n`;
      msg += userSudah.length
        ? userSudah.map(u => `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.insta || "-"}\n`).join("")
        : "-\n";
    }
    if (mode === "all" || mode === "belum") {
      msg += `❌ Belum: ${userBelum.length}\n`;
      msg += userBelum.length
        ? userBelum.map(u => `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.insta || "-"}\n`).join("")
        : "-\n";
    }
  }
  msg += `\nTerimakasih.`;
  return msg.trim();
}
