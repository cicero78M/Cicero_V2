export async function handleAbsensiKomentar(
  waClient,
  chatId,
  client_id,
  filter1 = "",
  filter2 = ""
) {
  function sortDivisionKeys(keys) {
    const order = ["BAG", "SAT", "POLSEK"];
    return keys.sort((a, b) => {
      const ia = order.findIndex((prefix) =>
        a.toUpperCase().startsWith(prefix)
      );
      const ib = order.findIndex((prefix) =>
        b.toUpperCase().startsWith(prefix)
      );
      return (
        (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
      );
    });
  }
  function groupByDivision(arr) {
    const divGroups = {};
    arr.forEach((u) => {
      const div = u.divisi || "-";
      if (!divGroups[div]) divGroups[div] = [];
      divGroups[div].push(u);
    });
    return divGroups;
  }
  function formatNama(u) {
    return [u.title, u.nama].filter(Boolean).join(" ");
  }
  function normalizeKomentarArr(arr) {
    return arr
      .map((c) => {
        if (typeof c === "string") return c.replace(/^@/, "").toLowerCase();
        if (c && typeof c === "object") {
          return (c.user?.unique_id || c.username || "")
            .replace(/^@/, "")
            .toLowerCase();
        }
        return "";
      })
      .filter(Boolean);
  }

  // Header laporan
  const headerLaporan = `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar pada Akun Official TikTok:\n\n`;
  const now = new Date();
  const hariIndo = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
  ];
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  // Query ke database
  const { getUsersByClient } = await import("../model/userModel.js");
  const { getPostsTodayByClient } = await import("../model/tiktokPostModel.js");
  const users = await getUsersByClient(client_id);
  const posts = await getPostsTodayByClient(client_id);

  let client_tiktok = "-";
  try {
    const { pool } = await import("../config/db.js");
    const q = "SELECT client_tiktok FROM clients WHERE client_id = $1 LIMIT 1";
    const result = await pool.query(q, [client_id]);
    if (result.rows[0] && result.rows[0].client_tiktok) {
      client_tiktok = result.rows[0].client_tiktok.replace(/^@/, "");
    }
  } catch (err) {}

  // Link video
  const kontenLinks = posts.map(
    (p) =>
      `https://www.tiktok.com/@${client_tiktok}/video/${p.video_id || p.id}`
  );

  // Fetch & store komentar
  const { fetchAndStoreTiktokComments } = await import(
    "../service/tiktokCommentService.js"
  );
  for (const post of posts) {
    const video_id = post.video_id || post.id;
    try {
      await fetchAndStoreTiktokComments(video_id);
    } catch {}

    // break only for akumulasi (fetch all before loop)
    if (filter1 === "akumulasi") break;
  }

  const { getCommentsByVideoId } = await import(
    "../model/tiktokCommentModel.js"
  );

  // === MODE AKUMULASI ===
  if (filter1 === "akumulasi") {
    const userStats = {};
    users.forEach((u) => {
      userStats[u.user_id] = { ...u, count: 0 };
    });

    for (const post of posts) {
      const video_id = post.video_id || post.id;
      const komentar = await getCommentsByVideoId(video_id);
      let commentsArr = Array.isArray(komentar?.comments)
        ? komentar.comments
        : [];
      commentsArr = normalizeKomentarArr(commentsArr);
      const usernameSet = new Set(commentsArr);

      users.forEach((u) => {
        const tiktokUsername = (u.tiktok || "").replace(/^@/, "").toLowerCase();
        if (u.tiktok && usernameSet.has(tiktokUsername)) {
          userStats[u.user_id].count += 1;
        }
      });
    }

    let sudah = [],
      belum = [];
    const totalKonten = posts.length;

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

    sudah = [...sudah, ...belum.filter((u) => u.exception === true)];
    belum = belum.filter((u) => u.exception !== true);

    const tipe = filter2 === "belum" ? "belum" : "sudah";
    let msg =
      headerLaporan +
      `📋 Rekap Akumulasi Komentar TikTok\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
      `*Jumlah Konten:* ${totalKonten}\n` +
      `*Daftar link video hari ini:*\n${kontenLinks.join("\n")}\n\n` +
      `*Jumlah user:* ${users.length}\n` +
      `✅ Sudah melaksanakan: *${sudah.length}*\n` +
      `❌ Belum melaksanakan: *${belum.length}*\n\n`;

    if (tipe === "sudah") {
      msg += `✅ Sudah melaksanakan (${sudah.length} user):\n`;
      const sudahDiv = groupByDivision(sudah);
      sortDivisionKeys(Object.keys(sudahDiv)).forEach((div) => {
        const list = sudahDiv[div];
        msg += `*${div}* (${list.length} user):\n`;
        msg +=
          list
            .map(
              (u) =>
                `- ${formatNama(u)} : ${
                  u.tiktok || "belum mengisi data tiktok"
                } (${u.count} video)${
                  !u.tiktok ? " (belum mengisi data tiktok)" : ""
                }`
            )
            .join("\n") + "\n\n";
      });
    } else {
      msg += `❌ Belum melaksanakan (${belum.length} user):\n`;
      const belumDiv = groupByDivision(belum);
      sortDivisionKeys(Object.keys(belumDiv)).forEach((div) => {
        const list = belumDiv[div];
        msg += `*${div}* (${list.length} user):\n`;
        msg +=
          list
            .map(
              (u) =>
                `- ${formatNama(u)} : ${
                  u.tiktok ? u.tiktok : "belum mengisi data tiktok"
                } (0 video)${!u.tiktok ? " (belum mengisi data tiktok)" : ""}`
            )
            .join("\n") + "\n\n";
      });
    }
    msg += "\nTerimakasih.";
    await waClient.sendMessage(chatId, msg.trim());
    return;
  }

  // === MODE PER-POST (default/sudah/belum) ===
  for (const post of posts) {
    const video_id = post.video_id || post.id;
    const komentar = await getCommentsByVideoId(video_id);
    let commentsArr = Array.isArray(komentar?.comments)
      ? komentar.comments
      : [];
    commentsArr = normalizeKomentarArr(commentsArr);
    const usernameSet = new Set(commentsArr);

    let sudah = [],
      belum = [];
    users.forEach((u) => {
      const tiktokUsername = (u.tiktok || "").replace(/^@/, "").toLowerCase();
      if (u.exception === true) {
        sudah.push(u);
      } else if (
        u.tiktok &&
        u.tiktok.trim() !== "" &&
        usernameSet.has(tiktokUsername)
      ) {
        sudah.push(u);
      } else {
        belum.push(u);
      }
    });

    sudah = [...sudah, ...belum.filter((u) => u.exception === true)];
    belum = belum.filter((u) => u.exception !== true);

    let msg =
      headerLaporan +
      `📋 Absensi Komentar TikTok\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
      `*Video ID:* ${video_id}\n` +
      `*Link video:* https://www.tiktok.com/@${client_tiktok}/video/${video_id}\n` +
      `*Jumlah user:* ${users.length}\n` +
      `✅ Sudah melaksanakan: *${sudah.length}*\n` +
      `❌ Belum melaksanakan: *${belum.length}*\n\n`;

    if (!filter1) {
      msg += `✅ Sudah melaksanakan (${sudah.length} user):\n`;
      const sudahDiv = groupByDivision(sudah);
      sortDivisionKeys(Object.keys(sudahDiv)).forEach((div) => {
        const list = sudahDiv[div];
        msg += `*${div}* (${list.length} user):\n`;
        msg +=
          list
            .map(
              (u) =>
                `- ${formatNama(u)} : ${
                  u.tiktok || "belum mengisi data tiktok"
                }${!u.tiktok ? " (belum mengisi data tiktok)" : ""}`
            )
            .join("\n") + "\n\n";
      });
      msg += `\n❌ Belum melaksanakan (${belum.length} user):\n`;
      const belumDiv = groupByDivision(belum);
      sortDivisionKeys(Object.keys(belumDiv)).forEach((div) => {
        const list = belumDiv[div];
        msg += `*${div}* (${list.length} user):\n`;
        msg +=
          list
            .map(
              (u) =>
                `- ${formatNama(u)} : ${
                  u.tiktok ? u.tiktok : "belum mengisi data tiktok"
                }${!u.tiktok ? " (belum mengisi data tiktok)" : ""}`
            )
            .join("\n") + "\n\n";
      });
      msg += "\nTerimakasih.";
      await waClient.sendMessage(chatId, msg.trim());
      continue;
    }

    if (filter1 === "sudah") {
      let msgSudah = msg + `✅ Sudah melaksanakan (${sudah.length} user):\n`;
      const sudahDiv = groupByDivision(sudah);
      sortDivisionKeys(Object.keys(sudahDiv)).forEach((div) => {
        const list = sudahDiv[div];
        msgSudah += `*${div}* (${list.length} user):\n`;
        msgSudah +=
          list
            .map(
              (u) =>
                `- ${formatNama(u)} : ${
                  u.tiktok || "belum mengisi data tiktok"
                }${!u.tiktok ? " (belum mengisi data tiktok)" : ""}`
            )
            .join("\n") + "\n\n";
      });
      msgSudah += "\nTerimakasih.";
      await waClient.sendMessage(chatId, msgSudah.trim());
      continue;
    }

    if (filter1 === "belum") {
      let msgBelum = msg + `❌ Belum melaksanakan (${belum.length} user):\n`;
      const belumDiv = groupByDivision(belum);
      sortDivisionKeys(Object.keys(belumDiv)).forEach((div) => {
        const list = belumDiv[div];
        msgBelum += `*${div}* (${list.length} user):\n`;
        msgBelum +=
          list
            .map(
              (u) =>
                `- ${formatNama(u)} : ${
                  u.tiktok ? u.tiktok : "belum mengisi data tiktok"
                }${!u.tiktok ? " (belum mengisi data tiktok)" : ""}`
            )
            .join("\n") + "\n\n";
      });
      msgBelum += "\nTerimakasih.";
      await waClient.sendMessage(chatId, msgBelum.trim());
      continue;
    }
  }
} 