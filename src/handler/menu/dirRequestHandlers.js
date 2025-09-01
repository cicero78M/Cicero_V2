import { getUsersSocialByClient, getClientsByRole } from "../../model/userModel.js";
import { absensiLikes, lapharDitbinmas } from "../fetchabsensi/insta/absensiLikesInsta.js";
import { absensiKomentar } from "../fetchabsensi/tiktok/absensiKomentarTiktok.js";
import { findClientById } from "../../service/clientService.js";
import { getGreeting, sortDivisionKeys, formatNama } from "../../utils/utilsHelper.js";
import { sendWAFile } from "../../utils/waHelper.js";
import { writeFile } from "fs/promises";

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

async function formatRekapUserData(clientId, roleFlag = null) {
  const directorateRoles = ["ditbinmas", "ditlantas", "bidhumas"];
  const filterRole = directorateRoles.includes(roleFlag?.toLowerCase())
    ? roleFlag
    : null;
  const client = await findClientById(clientId);
  const users = await getUsersSocialByClient(clientId, filterRole);
  const salam = getGreeting();
  const now = new Date();
  const hari = now.toLocaleDateString("id-ID", { weekday: "long" });
  const tanggal = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const jam = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const clientType = client?.client_type?.toLowerCase();
  const isDirektoratView =
    clientType === "direktorat" ||
    directorateRoles.includes(clientId.toLowerCase()) ||
    directorateRoles.includes(roleFlag?.toLowerCase());
  if (isDirektoratView) {
    const groups = {};
    users.forEach((u) => {
      const cid = (u.client_id || "").toLowerCase();
      if (!groups[cid]) groups[cid] = { total: 0, insta: 0, tiktok: 0, complete: 0 };
      groups[cid].total++;
      if (u.insta) groups[cid].insta++;
      if (u.tiktok) groups[cid].tiktok++;
      if (u.insta && u.tiktok) groups[cid].complete++;
    });

    const roleName = (filterRole || clientId).toLowerCase();
    const polresIds = (await getClientsByRole(roleName)) || [];
    const clientIdLower = clientId.toLowerCase();
    const allIds = Array.from(
      new Set([clientIdLower, ...polresIds.map((id) => id.toLowerCase()), ...Object.keys(groups)])
    );

    const entries = await Promise.all(
      allIds.map(async (cid) => {
        const stat =
          groups[cid] || { total: 0, insta: 0, tiktok: 0, complete: 0 };
        const c = await findClientById(cid);
        const name = (c?.nama || cid).toUpperCase();
        return { cid, name, stat };
      })
    );

    const withData = entries.filter(
      (e) => e.cid === "ditbinmas" || e.stat.total > 0
    );
    const noData = entries.filter(
      (e) => e.stat.total === 0 && e.cid !== "ditbinmas"
    );

    withData.sort((a, b) => {
      if (a.cid === "ditbinmas") return -1;
      if (b.cid === "ditbinmas") return 1;
      if (a.stat.complete !== b.stat.complete)
        return b.stat.complete - a.stat.complete;
      if (a.stat.total !== b.stat.total) return b.stat.total - a.stat.total;
      return a.name.localeCompare(b.name);
    });
    noData.sort((a, b) => {
      if (a.cid === "ditbinmas") return -1;
      if (b.cid === "ditbinmas") return 1;
      return a.name.localeCompare(b.name);
    });

    const withDataLines = withData.map(
      (e, idx) =>
        `${idx + 1}. ${e.name}\n\n` +
        `Jumlah Total Personil : ${e.stat.total}\n` +
        `Jumlah Total Personil Sudah Mengisi Instagram : ${e.stat.insta}\n` +
        `Jumlah Total Personil Sudah Mengisi Tiktok : ${e.stat.tiktok}\n` +
        `Jumlah Total User Belum Update Data : ${e.stat.total - e.stat.complete}`
    );
    const noDataLines = noData.map((e, idx) => `${idx + 1}. ${e.name}`);

    const totals = entries.reduce(
      (acc, e) => {
        acc.total += e.stat.total;
        acc.insta += e.stat.insta;
        acc.tiktok += e.stat.tiktok;
        acc.complete += e.stat.complete;
        return acc;
      },
      { total: 0, insta: 0, tiktok: 0, complete: 0 }
    );

    const header =
      `${salam},\n\n` +
      `Mohon ijin Komandan, melaporkan absensi update data personil ${
        (client?.nama || clientId).toUpperCase()
      } pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:`;

    const sections = [
      `Jumlah Total Personil : ${totals.total}\n` +
        `Jumlah Total Personil Sudah Mengisi Instagram : ${totals.insta}\n` +
        `Jumlah Total Personil Sudah Mengisi Tiktok : ${totals.tiktok}\n` +
        `Jumlah Total User Belum Update Data : ${totals.total - totals.complete}`,
    ];
    if (withDataLines.length)
      sections.push(`Sudah Input Data:\n\n${withDataLines.join("\n\n")}`);
    if (noDataLines.length)
      sections.push(`Client Belum Input Data:\n${noDataLines.join("\n")}`);
    const body = `\n\n${sections.join("\n\n")}`;

    return `${header}${body}`.trim();
  }

  const complete = {};
  const incomplete = {};
  users.forEach((u) => {
    const div = u.divisi || "-";
    if (u.insta && u.tiktok) {
      if (!complete[div]) complete[div] = [];
      complete[div].push(u);
    } else {
      const missing = [];
      if (!u.insta) missing.push("Instagram kosong");
      if (!u.tiktok) missing.push("TikTok kosong");
      if (!incomplete[div]) incomplete[div] = [];
      incomplete[div].push({ ...u, missing: missing.join(", ") });
    }
  });

  if (clientType === "org") {
    const completeLines = sortDivisionKeys(Object.keys(complete)).map((d) => {
      const list = complete[d]
        .sort((a, b) => rankIdx(a.title) - rankIdx(b.title) || formatNama(a).localeCompare(formatNama(b)))
        .map((u) => formatNama(u))
        .join("\n\n");
      return `${d.toUpperCase()} (${complete[d].length})\n\n${list}`;
    });
    const incompleteLines = sortDivisionKeys(Object.keys(incomplete)).map((d) => {
      const list = incomplete[d]
        .sort((a, b) => rankIdx(a.title) - rankIdx(b.title) || formatNama(a).localeCompare(formatNama(b)))
        .map((u) => `${formatNama(u)}, ${u.missing}`)
        .join("\n\n");
      return `${d.toUpperCase()} (${incomplete[d].length})\n\n${list}`;
    });
    const sections = [];
    if (completeLines.length) sections.push(`Sudah Lengkap :\n\n${completeLines.join("\n\n")}`);
    if (incompleteLines.length) sections.push(`Belum Lengkap:\n\n${incompleteLines.join("\n\n")}`);
    const body = sections.join("\n\n");
    return (
      `${salam},\n\n` +
      `Mohon ijin Komandan, melaporkan absensi update data personil ${
        (client?.nama || clientId).toUpperCase()
      } pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:\n\n` +
      body
    ).trim();
  }

  const completeLines = sortDivisionKeys(Object.keys(complete)).map((d) => {
    const list = complete[d]
      .sort((a, b) => rankIdx(a.title) - rankIdx(b.title) || formatNama(a).localeCompare(formatNama(b)))
      .map((u) => formatNama(u))
      .join("\n\n");
    return `${d}, Sudah lengkap: (${complete[d].length})\n\n${list}`;
  });
  const incompleteLines = sortDivisionKeys(Object.keys(incomplete)).map((d) => {
    const list = incomplete[d]
      .sort((a, b) => rankIdx(a.title) - rankIdx(b.title) || formatNama(a).localeCompare(formatNama(b)))
      .map((u) => `${formatNama(u)}, ${u.missing}`)
      .join("\n\n");
    return `${d}, Belum lengkap: (${incomplete[d].length})\n\n${list}`;
  });

  const body = [...completeLines, ...incompleteLines].filter(Boolean).join("\n\n");

  return (
    `${salam},\n\n` +
    `Mohon ijin Komandan, melaporkan absensi update data personil ${
      (client?.nama || clientId).toUpperCase()
    } pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:\n\n` +
    body
  ).trim();
}

async function rekapUserDataDitbinmas() {
  const clientId = "ditbinmas";
  const users = (await getUsersSocialByClient(clientId, clientId)).filter(
    (u) => (u.client_id || "").toLowerCase() === clientId
  );
  const salam = getGreeting();
  const now = new Date();
  const hari = now.toLocaleDateString("id-ID", { weekday: "long" });
  const tanggal = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const jam = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const groups = {};
  users.forEach((u) => {
    const div = u.divisi || "-";
    if (!groups[div]) groups[div] = [];
    groups[div].push(u);
  });

  const lines = sortDivisionKeys(Object.keys(groups)).map((div) => {
    const list = groups[div]
      .sort((a, b) => rankIdx(a.title) - rankIdx(b.title) || formatNama(a).localeCompare(formatNama(b)))
      .map((u) => formatNama(u))
      .join("\n");
    return `${div.toUpperCase()} (${groups[div].length})\n${list}`;
  });

  const client = await findClientById(clientId);
  const header =
    `${salam},\n\n` +
    `Mohon ijin Komandan, melaporkan rekap data personil ${
      (client?.nama || clientId).toUpperCase()
    } pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:\n\n`;
  const body = lines.join("\n\n");
  return `${header}${body}`.trim();
}

async function performAction(action, clientId, waClient, chatId, roleFlag, userClientId) {
  let msg = "";
  const userClient = userClientId ? await findClientById(userClientId) : null;
  const userType = userClient?.client_type?.toLowerCase();
  switch (action) {
    case "1": {
      msg = await formatRekapUserData(clientId, roleFlag);
      break;
    }
    case "2":
      msg = await rekapUserDataDitbinmas();
      break;
    case "3": {
      const normalizedId = (clientId || "").toUpperCase();
      if (normalizedId !== "DITBINMAS") {
        msg = "Menu ini hanya tersedia untuk client DITBINMAS.";
        break;
      }
      const opts = { mode: "all", roleFlag: "ditbinmas" };
      msg = await absensiLikes("DITBINMAS", opts);
      break;
    }
    case "4":
      msg = await absensiKomentar(clientId, {
        ...(userType === "org" ? { clientFilter: userClientId } : {}),
        mode: "all",
        roleFlag,
      });
      break;
    case "5": {
      const { fetchAndStoreInstaContent } = await import(
        "../fetchpost/instaFetchPost.js"
      );
      const { handleFetchLikesInstagram } = await import(
        "../fetchengagement/fetchLikesInstagram.js"
      );
      const { rekapLikesIG } = await import(
        "../fetchabsensi/insta/absensiLikesInsta.js"
      );
      await fetchAndStoreInstaContent(
        ["shortcode", "caption", "like_count", "timestamp"],
        waClient,
        chatId,
        "DITBINMAS"
      );
      await handleFetchLikesInstagram(null, null, "DITBINMAS");
      const rekapMsg = await rekapLikesIG("DITBINMAS");
      msg =
        rekapMsg ||
        "Tidak ada konten IG untuk DIREKTORAT BINMAS hari ini.";
      break;
    }
    case "6": {
      const { handleFetchLikesInstagram } = await import(
        "../fetchengagement/fetchLikesInstagram.js"
      );
      await handleFetchLikesInstagram(waClient, chatId, "DITBINMAS");
      msg = "✅ Selesai fetch likes Instagram DITBINMAS.";
      break;
    }
    case "7": {
      const { fetchAndStoreTiktokContent } = await import(
        "../fetchpost/tiktokFetchPost.js"
      );
      await fetchAndStoreTiktokContent("DITBINMAS", waClient, chatId);
      msg = "✅ Selesai fetch TikTok DITBINMAS.";
      break;
    }
    case "8": {
      const { handleFetchKomentarTiktokBatch } = await import(
        "../fetchengagement/fetchCommentTiktok.js"
      );
      await handleFetchKomentarTiktokBatch(waClient, chatId, "DITBINMAS");
      msg = "✅ Selesai fetch komentar TikTok DITBINMAS.";
      break;
    }
    case "9": {
      const { text, filename } = await lapharDitbinmas();
      const buffer = Buffer.from(text, "utf-8");
      await writeFile(filename, buffer);
      await sendWAFile(waClient, buffer, filename, chatId, "text/plain");
      msg = "✅ Laphar Ditbinmas dikirim.";
      break;
    }
    default:
      msg = "Menu tidak dikenal.";
  }
  await waClient.sendMessage(chatId, msg.trim());
}

export const dirRequestHandlers = {
  async choose_dash_user(session, chatId, text, waClient) {
    const dashUsers = session.dash_users || [];
    if (!text) {
      const list = await Promise.all(
        dashUsers.map(async (u, idx) => {
          let cid = u.client_ids[0];
          let c = cid ? await findClientById(cid) : null;
          if (!cid || c?.client_type?.toLowerCase() === "direktorat") {
            cid = u.role;
            c = await findClientById(cid);
          }
          const name = (c?.nama || cid).toUpperCase();
          return `${idx + 1}. ${name} (${cid.toUpperCase()})`;
        })
      );
      await waClient.sendMessage(
        chatId,
        `Pilih Client:\n${list.join("\n")}\n\nBalas angka untuk memilih atau *batal* untuk keluar.`
      );
      return;
    }
    const idx = parseInt(text.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= dashUsers.length) {
      await waClient.sendMessage(
        chatId,
        "Pilihan client tidak valid. Balas angka yang tersedia."
      );
      return;
    }
    const chosen = dashUsers[idx];
    session.role = chosen.role;
    const dir = await findClientById(chosen.role);
    session.client_ids = chosen.client_ids;
    session.dir_client_id =
      dir?.client_type?.toLowerCase() === "direktorat" ? chosen.role : null;
    delete session.dash_users;
    session.step = "main";
    await dirRequestHandlers.main(session, chatId, "", waClient);
  },

  async main(session, chatId, _text, waClient) {
    const ids = session.client_ids || [];
    if (!session.selectedClientId) {
      if (ids.length === 1) {
        session.selectedClientId = ids[0];
        const client = await findClientById(ids[0]);
        session.clientName = client?.nama || ids[0];
      } else if (ids.length > 1) {
        const list = await Promise.all(
          ids.map(async (id, idx) => {
            const c = await findClientById(id);
            const name = (c?.nama || id).toUpperCase();
            return `${idx + 1}. ${name} (${id.toUpperCase()})`;
          })
        );
        await waClient.sendMessage(
          chatId,
          `Pilih Client:\n\n${list.join("\n")}\n\nBalas angka untuk memilih atau *batal* untuk keluar.`
        );
        session.step = "choose_client";
        return;
      } else {
        await waClient.sendMessage(chatId, "Tidak ada client terkait.");
        return;
      }
    }

    const clientName = session.clientName;
    const menu =
      `Client: *${clientName}*\n` +
      "┏━━━ *MENU DIRREQUEST* ━━━\n" +
      "1️⃣ Rekap user belum lengkapi data\n" +
      "2️⃣ Rekap user data Ditbinmas\n" +
      "3️⃣ Absensi Likes Instagram\n" +
      "4️⃣ Absensi Komentar TikTok\n" +
      "5️⃣ Fetch Insta\n" +
      "6️⃣ Fetch Likes Insta\n" +
      "7️⃣ Fetch TikTok\n" +
      "8️⃣ Fetch Komentar TikTok\n" +
      "9️⃣ Laphar Ditbinmas\n" +
      "┗━━━━━━━━━━━━━━━━━┛\n" +
      "Ketik *angka* menu atau *batal* untuk keluar.";
    await waClient.sendMessage(chatId, menu);
    session.step = "choose_menu";
  },

  async choose_client(session, chatId, text, waClient) {
    const idx = parseInt(text.trim(), 10) - 1;
    const ids = session.client_ids || [];
    if (isNaN(idx) || idx < 0 || idx >= ids.length) {
      await waClient.sendMessage(
        chatId,
        "Pilihan client tidak valid. Balas angka yang tersedia."
      );
      return;
    }
    session.selectedClientId = ids[idx];
    const client = await findClientById(session.selectedClientId);
    session.clientName = client?.nama || session.selectedClientId;
    await dirRequestHandlers.main(session, chatId, "", waClient);
  },

  async choose_menu(session, chatId, text, waClient) {
    const choice = text.trim();
    if (!["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(choice)) {
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Ketik angka menu.");
      return;
    }
    const userClientId = session.selectedClientId;
    if (!userClientId) {
      await waClient.sendMessage(chatId, "Client belum dipilih.");
      session.step = "main";
      await dirRequestHandlers.main(session, chatId, "", waClient);
      return;
    }
    const taskClientId = session.dir_client_id || userClientId;
    await performAction(
      choice,
      taskClientId,
      waClient,
      chatId,
      session.role,
      userClientId
    );
    session.step = "main";
    await dirRequestHandlers.main(session, chatId, "", waClient);
  },
};

export { formatRekapUserData, rekapUserDataDitbinmas };

export default dirRequestHandlers;

