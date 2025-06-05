import * as util from "../utils/utilsHelper.js";


export async function handleAbsensiLikes(
  waClient,
  chatId,
  client_id,
  filter1 = "",
  filter2 = ""
) {


  await waClient.sendMessage(
    chatId,
    "⏳ Memperbarui konten & likes Instagram..."
  );
  try {
    await fetchAndStoreInstaContent(null);
  } catch (e) {
    await waClient.sendMessage(
      chatId,
      `⚠️ Gagal update konten IG: ${e.message}\nAbsensi tetap dilanjutkan dengan data terakhir di database.`
    );
  }

  const headerLaporan = `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar dan Likes pada Akun Official:\n\n`;
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

  const users = await getUsersByClient(client_id);
  const shortcodes = await getShortcodesTodayByClient(client_id);

  if (!shortcodes || shortcodes.length === 0) {
    await waClient.sendMessage(
      chatId,
      headerLaporan +
        `Tidak ada konten IG untuk *Polres*: *${client_id}* hari ini.\n${hari}, ${tanggal}\nJam: ${jam}`
    );
    return;
  }

  const kontenLinks = shortcodes.map(
    (sc) => `https://www.instagram.com/p/${sc}`
  );
  const totalKonten = shortcodes.length;

  // === MODE AKUMULASI ===
  if (filter1 === "akumulasi") {
    const userStats = {};
    users.forEach((u) => {
      userStats[u.user_id] = { ...u, count: 0 };
    });

    for (const shortcode of shortcodes) {
      const likes = await getLikesByShortcode(shortcode);
      const likesSet = new Set(likes.map((l) => (l || "").toLowerCase()));
      users.forEach((u) => {
        if (u.insta && likesSet.has(u.insta.toLowerCase())) {
          userStats[u.user_id].count += 1;
        }
      });
    }

    let sudah = [],
      belum = [];
    Object.values(userStats).forEach((u) => {
      if (u.exception) {
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

    const tipe = filter2 === "belum" ? "belum" : "sudah";
    let msg =
      headerLaporan +
      `📋 Rekap Akumulasi Likes IG\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
      `*Jumlah Konten:* ${totalKonten}\n` +
      `*Daftar link konten hari ini:*\n${kontenLinks.join("\n")}\n\n` +
      `*Jumlah user:* ${users.length}\n` +
      `✅ Sudah melaksanakan: *${sudah.length}*\n` +
      `❌ Belum melaksanakan: *${belum.length}*\n\n`;

    if (tipe === "sudah") {
      msg += `✅ Sudah melaksanakan (${sudah.length} user):\n`;
      const sudahDiv = util.groupByDivision(sudah);
      util.sortDivisionKeys(Object.keys(sudahDiv)).forEach((div) => {
        const list = sudahDiv[div];
        msg += `*${div}* (${list.length} user):\n`;
        msg +=
          list
            .map(
              (u) =>
                `- ${formatNama(u)} : ${
                  u.insta || "belum mengisi data insta"
                } (${u.count} konten)${
                  !u.insta ? " (belum mengisi data insta)" : ""
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
                  u.insta ? u.insta : "belum mengisi data insta"
                } (0 konten)${!u.insta ? " (belum mengisi data insta)" : ""}`
            )
            .join("\n") + "\n\n";
      });
    }

    msg += "\nTerimakasih.";
    await waClient.sendMessage(chatId, msg.trim());
    return;
  }

  // === MODE PER-KONTEN (DEFAULT/sudah/belum) ===
  for (const shortcode of shortcodes) {
    const likes = await getLikesByShortcode(shortcode);
    const likesSet = new Set(likes.map((l) => (l || "").toLowerCase()));
    let sudah = [],
      belum = [];
    users.forEach((u) => {
      if (u.exception) {
        sudah.push(u);
      } else if (
        u.insta &&
        u.insta.trim() !== "" &&
        likesSet.has(u.insta.toLowerCase())
      ) {
        sudah.push(u);
      } else {
        belum.push(u);
      }
    });

    const linkIG = `https://www.instagram.com/p/${shortcode}`;
    let msg =
      headerLaporan +
      `📋 Absensi Likes IG\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
      `*Jumlah Konten:* 1\n` +
      `*Daftar link konten hari ini:*\n${linkIG}\n\n` +
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
                `- ${formatNama(u)} : ${u.insta || "belum mengisi data insta"}${
                  !u.insta ? " (belum mengisi data insta)" : ""
                }`
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
                  u.insta ? u.insta : "belum mengisi data insta"
                }${!u.insta ? " (belum mengisi data insta)" : ""}`
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
                `- ${formatNama(u)} : ${u.insta || "belum mengisi data insta"}${
                  !u.insta ? " (belum mengisi data insta)" : ""
                }`
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
                  u.insta ? u.insta : "belum mengisi data insta"
                }${!u.insta ? " (belum mengisi data insta)" : ""}`
            )
            .join("\n") + "\n\n";
      });
      msgBelum += "\nTerimakasih.";
      await waClient.sendMessage(chatId, msgBelum.trim());
      continue;
    }
  }
}