import { getUsersSocialByClient } from "../../model/userModel.js";
import { absensiLink } from "../fetchabsensi/link/absensiLinkAmplifikasi.js";
import { absensiLikes } from "../fetchabsensi/insta/absensiLikesInsta.js";
import { absensiKomentar } from "../fetchabsensi/tiktok/absensiKomentarTiktok.js";
import { findClientById } from "../../service/clientService.js";
import { getGreeting, sortDivisionKeys, formatNama } from "../../utils/utilsHelper.js";

async function formatRekapUserData(clientId) {
  const client = await findClientById(clientId);
  const users = await getUsersSocialByClient(clientId);
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
  if (clientType === "direktorat") {
    const groups = {};
    users.forEach((u) => {
      const cid = u.client_id;
      if (!groups[cid]) groups[cid] = { total: 0, miss: 0 };
      groups[cid].total++;
      if (!u.insta || !u.tiktok) groups[cid].miss++;
    });

    const entries = await Promise.all(
      Object.entries(groups).map(async ([cid, stat]) => {
        const c = await findClientById(cid);
        const name = (c?.nama || cid).toUpperCase();
        const updated = stat.total - stat.miss;
        return { cid, name, stat, updated };
      })
    );

    entries.sort((a, b) => {
      if (a.cid === clientId) return -1;
      if (b.cid === clientId) return 1;
      return a.name.localeCompare(b.name);
    });

    const lines = entries.map(
      (e, idx) =>
        `${idx + 1}. ${e.name}\n\n` +
        `Jumlah User: ${e.stat.total}\n` +
        `Jumlah User Sudah Update: ${e.updated}\n` +
        `Jumlah User Belum Update: ${e.stat.miss}`
    );

    const header =
      `${salam},\n\n` +
      `Mohon ijin Komandan, melaporkan absensi update data personil ${
        (client?.nama || clientId).toUpperCase()
      } pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:`;
    const body = lines.length ? `\n\n${lines.join("\n\n")}` : "";
    return `${header}${body}`.trim();
  }

  const complete = {};
  const incomplete = {};
  users.forEach((u) => {
    const div = u.divisi || "-";
    const nama = formatNama(u);
    if (u.insta && u.tiktok) {
      if (!complete[div]) complete[div] = [];
      complete[div].push(nama);
    } else {
      const missing = [];
      if (!u.insta) missing.push("Instagram kosong");
      if (!u.tiktok) missing.push("TikTok kosong");
      if (!incomplete[div]) incomplete[div] = [];
      incomplete[div].push(`${nama}, ${missing.join(", ")}`);
    }
  });

  if (clientType === "org") {
    const completeLines = sortDivisionKeys(Object.keys(complete)).map((d) => {
      const list = complete[d].join("\n\n");
      return `${d.toUpperCase()} (${complete[d].length})\n\n${list}`;
    });
    const incompleteLines = sortDivisionKeys(Object.keys(incomplete)).map((d) => {
      const list = incomplete[d].join("\n\n");
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
    const list = complete[d].join("\n\n");
    return `${d}, Sudah lengkap: (${complete[d].length})\n\n${list}`;
  });
  const incompleteLines = sortDivisionKeys(Object.keys(incomplete)).map((d) => {
    const list = incomplete[d].join("\n\n");
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

async function performAction(action, clientId, waClient, chatId, roleFlag, userClientId) {
  let msg = "";
  const userClient = userClientId ? await findClientById(userClientId) : null;
  const userType = userClient?.client_type?.toLowerCase();
  switch (action) {
    case "1": {
      msg = await formatRekapUserData(userClientId || clientId);
      break;
    }
    case "2":
      msg = await absensiLink(clientId, {
        ...(userType === "org" ? { clientFilter: userClientId } : {}),
        roleFlag,
      });
      break;
    case "3":
      msg = await absensiLikes(clientId, {
        ...(userType === "org" ? { clientFilter: userClientId } : {}),
        mode: "all",
        roleFlag,
      });
      break;
    case "4":
      msg = await absensiKomentar(clientId, {
        ...(userType === "org" ? { clientFilter: userClientId } : {}),
        mode: "all",
        roleFlag,
      });
      break;
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
      "2️⃣ Absensi Amplifikasi Instagram\n" +
      "3️⃣ Absensi Likes Instagram\n" +
      "4️⃣ Absensi Komentar TikTok\n" +
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
    if (!["1", "2", "3", "4"].includes(choice)) {
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

export default dirRequestHandlers;

