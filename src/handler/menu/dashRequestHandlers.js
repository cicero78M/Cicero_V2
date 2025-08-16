import { getUsersMissingDataByClient } from "../../model/userModel.js";
import { absensiLink } from "../fetchabsensi/link/absensiLinkAmplifikasi.js";
import { absensiLikes } from "../fetchabsensi/insta/absensiLikesInsta.js";
import { absensiKomentarInstagram } from "../fetchabsensi/insta/absensiKomentarInstagram.js";
import { absensiKomentar } from "../fetchabsensi/tiktok/absensiKomentarTiktok.js";

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
  async main(session, chatId, _text, waClient) {
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
    await performAction(choice, session.client_id, session.role, waClient, chatId);
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

