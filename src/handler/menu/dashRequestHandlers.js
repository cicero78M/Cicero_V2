import { getUsersMissingDataByClient } from "../../model/userModel.js";
import { absensiLink } from "../fetchabsensi/link/absensiLinkAmplifikasi.js";
import { absensiLikes } from "../fetchabsensi/insta/absensiLikesInsta.js";
import { absensiKomentarInstagram } from "../fetchabsensi/insta/absensiKomentarInstagram.js";
import { absensiKomentar } from "../fetchabsensi/tiktok/absensiKomentarTiktok.js";
import { findClientById } from "../../service/clientService.js";

function formatMissingData(users, clientId) {
  let msg = `*Rekap User Belum Lengkap*\\nClient: *${clientId}*\\n`;
  if (users.length === 0) {
    msg += "Semua user telah melengkapi data.";
    return msg.trim();
  }
  msg += `Jumlah: ${users.length} user\\n`;
  msg += users
    .map((u) => {
      const missing = [];
      if (!u.insta) missing.push("IG");
      if (!u.tiktok) missing.push("TT");
      if (!u.whatsapp) missing.push("WA");
      return `- ${u.nama} (${u.user_id}) kurang: ${missing.join(", ")}`;
    })
    .join("\\n");
  return msg.trim();
}

async function performAction(action, clientId, role, waClient, chatId) {
  let msg = "";
  switch (action) {
    case "1": {
      const users = await getUsersMissingDataByClient(clientId);
      msg = formatMissingData(users, clientId);
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
          const cid = u.client_ids[0];
          const c = await findClientById(cid);
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
    session.client_ids = chosen.client_ids;
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

