import { getUsersSocialByClient } from "../../model/userModel.js";
import { absensiLink } from "../fetchabsensi/link/absensiLinkAmplifikasi.js";
import { absensiLikes } from "../fetchabsensi/insta/absensiLikesInsta.js";
import { absensiKomentarInstagram } from "../fetchabsensi/insta/absensiKomentarInstagram.js";
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

  if (client?.client_type?.toLowerCase() === "direktorat") {
    const groups = {};
    users.forEach((u) => {
      const cid = u.client_id;
      if (!groups[cid]) groups[cid] = { total: 0, miss: 0 };
      groups[cid].total++;
      if (!u.insta || !u.tiktok) groups[cid].miss++;
    });
    const lines = await Promise.all(
      Object.entries(groups).map(async ([cid, stat]) => {
        const c = await findClientById(cid);
        const name = c?.nama || cid;
        const updated = stat.total - stat.miss;
        return (
          `Nama Client ${name} :\n` +
          `- Jumlah User : ${stat.total}\n` +
          `- Jumlah User Sudah Update : ${updated}\n` +
          `- Jumlah User Belum Update : ${stat.miss}\n`
        );
      })
    );
    return (
      `${salam},\n\n` +
      `Mohon ijin Komandan, Melaporkan absensi update data personil ${
        client?.nama || clientId
      }, pada Hari ${hari}, Tanggal ${tanggal}, jam ${jam} Wib, sebagai berikut :\n\n` +
      lines.join("\n").trim()
    );
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
      if (!u.insta) missing.push("instagram kosong");
      if (!u.tiktok) missing.push("tiktok kosong");
      if (!incomplete[div]) incomplete[div] = [];
      incomplete[div].push(`${nama}, ${missing.join(", ")}`);
    }
  });

  const completeLines = sortDivisionKeys(Object.keys(complete)).map((d) => {
    const list = complete[d].map((n) => `- ${n}`).join("\n");
    return `Satfung ${d}, Sudah lengkap : (${complete[d].length})\n${list}`;
  });
  const incompleteLines = sortDivisionKeys(Object.keys(incomplete)).map((d) => {
    const list = incomplete[d].map((n) => `- ${n}`).join("\n");
    return `Satfung ${d}, Belum lengkap : (${incomplete[d].length})\n${list}`;
  });

  const body = [
    "Personil Sudah melengkapi data:",
    "",
    ...completeLines,
    "",
    ...incompleteLines,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    `${salam},\n\n` +
    `Mohon ijin Komandan, Melaporkan absensi update data personil ${
      client?.nama || clientId
    }, pada Hari ${hari}, Tanggal ${tanggal}, jam ${jam} Wib, sebagai berikut :\n\n` +
    body
  ).trim();
}

async function performAction(action, clientId, role, waClient, chatId) {
  let msg = "";
  switch (action) {
    case "1": {
      msg = await formatRekapUserData(clientId);
      break;
    }
    case "2":
      msg = await absensiLink(clientId, {
        roleFlag: role,
        clientFilter: clientId,
        mode: "all",
      });
      break;
    case "3":
      msg = await absensiLikes(clientId, {
        roleFlag: role,
        clientFilter: clientId,
        mode: "all",
      });
      break;
    case "4":
      msg = await absensiKomentarInstagram(clientId, {
        roleFlag: role,
        clientFilter: clientId,
        mode: "all",
      });
      break;
    case "5":
      msg = await absensiKomentar(clientId, {
        roleFlag: role,
        clientFilter: clientId,
        mode: "all",
      });
      break;
    default:
      msg = "Menu tidak dikenal.";
  }
  await waClient.sendMessage(chatId, msg.trim());
}

export const dashRequestHandlers = {
  async choose_dash_user(session, chatId, text, waClient) {
    const dashUsers = session.dash_users || [];
    if (!text) {
      const list = await Promise.all(
        dashUsers.map(async (u, i) => {
          let cid = u.client_ids[0];
          let c = cid ? await findClientById(cid) : null;
          if (!cid || c?.client_type?.toLowerCase() === "direktorat") {
            cid = u.role;
            c = await findClientById(cid);
          }
          const name = c?.nama || cid;
          return `${i + 1}. ${name} (${cid})`;
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
    if (dir?.client_type?.toLowerCase() === "direktorat") {
      session.client_ids = [chosen.role];
    } else {
      session.client_ids = chosen.client_ids;
    }
    delete session.dash_users;
    session.step = "main";
    await dashRequestHandlers.main(session, chatId, "", waClient);
  },
  async main(session, chatId, _text, waClient) {
    if (session.role === "admin") {
      const menu =
        "┏━━━ *MENU DASHBOARD* ━━━\n" +
        "1️⃣ Rekap user belum lengkapi data\n" +
        "2️⃣ Rekap link Instagram\n" +
        "3️⃣ Rekap likes Instagram\n" +
        "4️⃣ Rekap komentar Instagram\n" +
        "5️⃣ Rekap komentar TikTok\n" +
        "┗━━━━━━━━━━━━━━━━━┛\n" +
        "Ketik *angka* menu atau *batal* untuk keluar.";
      await waClient.sendMessage(chatId, menu);
      session.step = "choose_menu";
      return;
    }

    const ids = session.client_ids || [];
    if (!session.selectedClientId) {
      if (ids.length === 1) {
        session.selectedClientId = ids[0];
        const client = await findClientById(ids[0]);
        session.clientName = client?.nama || ids[0];
      } else if (ids.length > 1) {
        const list = await Promise.all(
          ids.map(async (id, i) => {
            const c = await findClientById(id);
            const name = c?.nama || id;
            return `${i + 1}. ${name} (${id})`;
          })
        );
        await waClient.sendMessage(
          chatId,
          `Pilih Client:\n${list.join("\n")}\n\nBalas angka untuk memilih atau *batal* untuk keluar.`
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
      "┏━━━ *MENU DASHBOARD* ━━━\n" +
      "1️⃣ Rekap user belum lengkapi data\n" +
      "2️⃣ Rekap link Instagram\n" +
      "3️⃣ Rekap likes Instagram\n" +
      "4️⃣ Rekap komentar Instagram\n" +
      "5️⃣ Rekap komentar TikTok\n" +
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
    await dashRequestHandlers.main(session, chatId, "", waClient);
  },

  async choose_menu(session, chatId, text, waClient) {
    const choice = text.trim();
    if (!["1", "2", "3", "4", "5"].includes(choice)) {
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Ketik angka menu.");
      return;
    }
    if (session.role === "admin") {
      session.pendingAction = choice;
      session.step = "ask_client";
      await waClient.sendMessage(chatId, "Masukkan Client ID target:");
      return;
    }
    const clientId = session.selectedClientId;
    if (!clientId) {
      await waClient.sendMessage(chatId, "Client belum dipilih.");
      session.step = "main";
      await dashRequestHandlers.main(session, chatId, "", waClient);
      return;
    }
    await performAction(choice, clientId, session.role, waClient, chatId);
    session.step = "main";
    await dashRequestHandlers.main(session, chatId, "", waClient);
  },

  async ask_client(session, chatId, text, waClient) {
    const clientId = text.trim().toUpperCase();
    const action = session.pendingAction;
    await performAction(action, clientId, session.role, waClient, chatId);
    delete session.pendingAction;
    session.step = "main";
    await dashRequestHandlers.main(session, chatId, "", waClient);
  },
};

export default dashRequestHandlers;

