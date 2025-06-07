
// src/handler/menu/clientRequestHandlers.js

import { handleFetchLikesInstagram } from "../fetchEngagement/fetchLikesInstagram.js";
import {
  absensiKomentar,
  absensiKomentarTiktokPerKonten,
} from "../fetchAbsensi/tiktok/absensiKomentarTiktok.js";
import { formatClientInfo } from "../../utils/utilsHelper.js";

// ==========================
// === ABSENSI USERNAME IG ===
async function absensiUsernameInsta(client_id, userService, mode = "all") {
  const users = await userService.getUsersByClient(client_id);
  const result = { sudah: [], belum: [] };
  for (const u of users) {
    if (u.insta && u.insta.trim()) result.sudah.push(u);
    else result.belum.push(u);
  }
  let msg = `*Absensi Username Instagram*\nClient: *${client_id}*`;
  if (mode === "all") {
    msg += `\n\n*Sudah mengisi IG* (${result.sudah.length}):\n`;
    msg += result.sudah.map((u, i) => `${i + 1}. ${u.nama} (${u.user_id}) @${u.insta}`).join("\n") || "-";
    msg += `\n\n*Belum mengisi IG* (${result.belum.length}):\n`;
    msg += result.belum.map((u, i) => `${i + 1}. ${u.nama} (${u.user_id})`).join("\n") || "-";
  } else if (mode === "sudah") {
    msg += `\n\n*Sudah mengisi IG* (${result.sudah.length}):\n`;
    msg += result.sudah.map((u, i) => `${i + 1}. ${u.nama} (${u.user_id}) @${u.insta}`).join("\n") || "-";
  } else if (mode === "belum") {
    msg += `\n\n*Belum mengisi IG* (${result.belum.length}):\n`;
    msg += result.belum.map((u, i) => `${i + 1}. ${u.nama} (${u.user_id})`).join("\n") || "-";
  }
  return msg;
}

// ==========================
// === ABSENSI USERNAME TIKTOK ===
async function absensiUsernameTiktok(client_id, userService, mode = "all") {
  const users = await userService.getUsersByClient(client_id);
  const result = { sudah: [], belum: [] };
  for (const u of users) {
    if (u.tiktok && u.tiktok.trim()) result.sudah.push(u);
    else result.belum.push(u);
  }
  let msg = `*Absensi Username TikTok*\nClient: *${client_id}*`;
  if (mode === "all") {
    msg += `\n\n*Sudah mengisi TikTok* (${result.sudah.length}):\n`;
    msg += result.sudah.map((u, i) => `${i + 1}. ${u.nama} (${u.user_id}) @${u.tiktok}`).join("\n") || "-";
    msg += `\n\n*Belum mengisi TikTok* (${result.belum.length}):\n`;
    msg += result.belum.map((u, i) => `${i + 1}. ${u.nama} (${u.user_id})`).join("\n") || "-";
  } else if (mode === "sudah") {
    msg += `\n\n*Sudah mengisi TikTok* (${result.sudah.length}):\n`;
    msg += result.sudah.map((u, i) => `${i + 1}. ${u.nama} (${u.user_id}) @${u.tiktok}`).join("\n") || "-";
  } else if (mode === "belum") {
    msg += `\n\n*Belum mengisi TikTok* (${result.belum.length}):\n`;
    msg += result.belum.map((u, i) => `${i + 1}. ${u.nama} (${u.user_id})`).join("\n") || "-";
  }
  return msg;
}

// ====================
// MAIN HANDLER OBJECT
// ====================
export const clientRequestHandlers = {
  main: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent,
    handleFetchKomentarTiktokBatch
  ) => {
    let msg = `
┏━━━ *MENU CLIENT CICERO* ━━━
1️⃣ Tambah client baru
2️⃣ Kelola client (update/hapus/info)
3️⃣ Kelola user (update/exception/status)
4️⃣ Proses Instagram
5️⃣ Proses TikTok
6️⃣ Rekap Absensi Likes IG
7️⃣ Rekap Absensi Komentar TikTok
8️⃣ Absensi Username Instagram
9️⃣ Absensi Username TikTok
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ketik *angka* menu, atau *batal* untuk keluar.
`.trim();

    if (!/^[1-9]$/.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, msg);
      return;
    }
    const mapStep = {
      1: "addClient_id",
      2: "kelolaClient_choose",
      3: "kelolaUser_choose",
      4: "prosesInstagram_choose",
      5: "prosesTiktok_choose",
      6: "absensiLikes_choose",
      7: "absensiKomentar_choose",
      8: "absensiUsernameInsta_choose",
      9: "absensiUsernameTiktok_choose",
    };
    session.step = mapStep[text.trim()];
    await clientRequestHandlers[session.step](
      session,
      chatId,
      "",
      waClient,
      pool,
      userService,
      clientService,
      migrateUsersFromFolder,
      checkGoogleSheetCsvStatus,
      importUsersFromGoogleSheet,
      fetchAndStoreInstaContent,
      fetchAndStoreTiktokContent,
      formatClientData,
      fetchAndStoreLikesInstaContent,
      handleFetchKomentarTiktokBatch
    );
  },

  // ================== TAMBAH CLIENT ==================
  addClient_id: async (session, chatId, text, waClient) => {
    session.addClient_id = text.trim().toUpperCase();
    session.step = "addClient_nama";
    await waClient.sendMessage(chatId, "Masukkan *nama* client:");
  },
  addClient_nama: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService
  ) => {
    session.addClient_nama = text.trim();
    session.step = "addClient_confirm";
    await waClient.sendMessage(
      chatId,
      `Konfirmasi penambahan client:\n*ID*: ${session.addClient_id}\n*Nama*: ${session.addClient_nama}\n\nBalas *ya* untuk simpan atau *batal* untuk batalkan.`
    );
  },
  addClient_confirm: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService
  ) => {
    if (text.trim().toLowerCase() === "ya") {
      try {
        const data = {
          client_id: session.addClient_id,
          nama: session.addClient_nama,
        };
        const newClient = await clientService.createClient(data);
        await waClient.sendMessage(
          chatId,
          `✅ Client baru berhasil dibuat:\n${JSON.stringify(
            newClient,
            null,
            2
          )}`
        );
      } catch (e) {
        await waClient.sendMessage(
          chatId,
          "Gagal menambah client: " + e.message
        );
      }
    } else {
      await waClient.sendMessage(chatId, "Penambahan client dibatalkan.");
    }
    session.step = "main";
  },

  // ================== KELENGKAPAN CLIENT ==================
  kelolaClient_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService
  ) => {
    // List client, tampilkan semua aktif & non-aktif
    const rows = await pool.query(
      "SELECT client_id, nama, client_status FROM clients ORDER BY client_status DESC, client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client (Semua Status)*\nBalas angka untuk memilih client:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama} ${c.client_status ? "🟢 Aktif" : "🔴 Tidak Aktif"}\n`;
    });
    session.step = "kelolaClient_action";
    await waClient.sendMessage(chatId, msg.trim());
  },
  kelolaClient_action: async (session, chatId, text, waClient) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai list."
      );
      return;
    }
    session.selected_client_id = clients[idx].client_id;
    session.step = "kelolaClient_menu";
    await waClient.sendMessage(
      chatId,
      `Kelola Client: *${clients[idx].nama}* (${clients[idx].client_id})\n` +
        `1️⃣ Update Data Client\n` +
        `2️⃣ Hapus Client\n` +
        `3️⃣ Info Client\nKetik angka menu di atas atau *batal* untuk keluar.`
    );
  },
  kelolaClient_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService
  ) => {
    if (text.trim() === "1") {
      session.step = "kelolaClient_updatefield";
      const fields = [
        { key: "client_insta", label: "Username Instagram" },
        { key: "client_operator", label: "Operator Client" },
        { key: "client_super", label: "Super Admin Client" },
        { key: "client_group", label: "Group Client" },
        { key: "tiktok_secUid", label: "TikTok SecUID" },
        { key: "client_tiktok", label: "Username TikTok" },
        { key: "client_status", label: "Status Aktif (true/false)" },
        { key: "client_insta_status", label: "Status IG Aktif (true/false)" },
        {
          key: "client_tiktok_status",
          label: "Status TikTok Aktif (true/false)",
        },
        { key: "client_type", label: "Tipe Client" },
      ];
      session.updateFieldList = fields;
      let msg = `Pilih field yang ingin diupdate:\n`;
      fields.forEach((f, i) => {
        msg += `${i + 1}. ${f.label} [${f.key}]\n`;
      });
      msg += `\nBalas dengan angka sesuai daftar di atas.`;
      await waClient.sendMessage(chatId, msg);
    } else if (text.trim() === "2") {
      try {
        const removed = await clientService.deleteClient(
          session.selected_client_id
        );
        await waClient.sendMessage(
          chatId,
          removed ? `🗑️ Client berhasil dihapus.` : "❌ Client tidak ditemukan."
        );
      } catch (e) {
        await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
      session.step = "main";
    } else if (text.trim() === "3") {
      const client = await clientService.findClientById(
        session.selected_client_id
      );
      await waClient.sendMessage(
        chatId,
        client ? formatClientInfo(client) : "❌ Client tidak ditemukan."
      );
      session.step = "main";
    } else {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai menu."
      );
    }
  },
  kelolaClient_updatefield: async (session, chatId, text, waClient) => {
    const idx = parseInt(text.trim()) - 1;
    const fields = session.updateFieldList || [];
    if (isNaN(idx) || !fields[idx]) {
      let msg = `Pilihan tidak valid. Balas angka sesuai daftar di atas.\n`;
      fields.forEach((f, i) => {
        msg += `${i + 1}. ${f.label} [${f.key}]\n`;
      });
      await waClient.sendMessage(chatId, msg.trim());
      return;
    }
    session.updateField = fields[idx].key;
    session.step = "kelolaClient_updatevalue";
    await waClient.sendMessage(
      chatId,
      `Masukkan value baru untuk *${fields[idx].label}* (key: ${fields[idx].key})\nUntuk boolean, isi dengan true/false:`
    );
  },
  kelolaClient_updatevalue: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService
  ) => {
    try {
      const updated = await clientService.updateClient(
        session.selected_client_id,
        { [session.updateField]: text.trim() }
      );
      await waClient.sendMessage(
        chatId,
        updated
          ? `✅ Update berhasil:\n${JSON.stringify(updated, null, 2)}`
          : "❌ Client tidak ditemukan atau update gagal."
      );
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
  },

  // ================== KELENGKAPAN USER (ALL) ==================
  kelolaUser_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    await waClient.sendMessage(
      chatId,
      `Kelola User:\n1️⃣ Update Data User\n2️⃣ Update Exception\n3️⃣ Update Status\nKetik angka menu atau *batal* untuk keluar.`
    );
    session.step = "kelolaUser_menu";
  },
  kelolaUser_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    if (!/^[1-3]$/.test(text.trim())) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka menu."
      );
      return;
    }
    session.kelolaUser_mode = text.trim();
    session.step = "kelolaUser_nrp";
    await waClient.sendMessage(chatId, "Masukkan *user_id* / NRP/NIP user:");
  },
  kelolaUser_nrp: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    session.target_user_id = text.trim();
    if (session.kelolaUser_mode === "1") {
      session.step = "kelolaUser_updatefield";
      let msg = `Pilih field user yang ingin diupdate:\n1. Nama\n2. Pangkat\n3. Satfung\n4. Jabatan\n5. Instagram\n6. TikTok\n7. WhatsApp\nBalas angka field.`;
      await waClient.sendMessage(chatId, msg);
    } else if (session.kelolaUser_mode === "2") {
      session.step = "kelolaUser_updateexception";
      await waClient.sendMessage(
        chatId,
        "Ketik *true* untuk exception, *false* untuk tidak exception:"
      );
    } else if (session.kelolaUser_mode === "3") {
      session.step = "kelolaUser_updatestatus";
      await waClient.sendMessage(
        chatId,
        "Ketik *true* untuk aktif, *false* untuk non-aktif:"
      );
    }
  },
  kelolaUser_updatefield: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    const fields = [
      "nama",
      "title",
      "divisi",
      "jabatan",
      "insta",
      "tiktok",
      "whatsapp",
    ];
    const idx = parseInt(text.trim()) - 1;
    if (isNaN(idx) || !fields[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai field."
      );
      return;
    }
    session.updateField = fields[idx];
    session.step = "kelolaUser_updatevalue";
    await waClient.sendMessage(
      chatId,
      `Ketik value baru untuk *${fields[idx]}* :`
    );
  },
  kelolaUser_updatevalue: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    try {
      await userService.updateUserField(
        session.target_user_id,
        session.updateField,
        text.trim()
      );
      await waClient.sendMessage(
        chatId,
        `✅ Data *${session.updateField}* untuk user *${session.target_user_id}* berhasil diupdate.`
      );
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error update: ${e.message}`);
    }
    session.step = "main";
  },
  kelolaUser_updateexception: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    try {
      const newException = text.trim().toLowerCase() === "true";
      await userService.updateUserField(
        session.target_user_id,
        "exception",
        newException
      );
      await waClient.sendMessage(
        chatId,
        `✅ User ${session.target_user_id} diupdate exception=${newException}.`
      );
    } catch (e) {
      await waClient.sendMessage(
        chatId,
        `Gagal update exception: ${e.message}`
      );
    }
    session.step = "main";
  },
  kelolaUser_updatestatus: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    try {
      const newStatus = text.trim().toLowerCase() === "true";
      await userService.updateUserField(
        session.target_user_id,
        "status",
        newStatus
      );
      await waClient.sendMessage(
        chatId,
        `✅ User ${session.target_user_id} diupdate status=${newStatus}.`
      );
    } catch (e) {
      await waClient.sendMessage(chatId, `Gagal update status: ${e.message}`);
    }
    session.step = "main";
  },

  // ================== PROSES INSTAGRAM (ALL) ==================
  prosesInstagram_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent
  ) => {
    // List client IG aktif
    const rows = await pool.query(
      "SELECT client_id, nama FROM clients WHERE client_insta_status = true ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client IG aktif.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client IG Aktif*\nBalas angka untuk pilih client:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. ${c.client_id} - ${c.nama}\n`;
    });
    session.step = "prosesInstagram_action";
    await waClient.sendMessage(chatId, msg.trim());
  },
  prosesInstagram_action: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai list."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    session.selected_client_id = client_id;
    session.step = "prosesInstagram_menu";
    await waClient.sendMessage(
      chatId,
      `Proses Instagram untuk *${client_id}*:\n1️⃣ Fetch Konten IG\n2️⃣ Fetch Likes IG\n3️⃣ Absensi Likes IG\nBalas angka menu di atas atau *batal* untuk keluar.`
    );
  },
  prosesInstagram_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent
  ) => {
    const client_id = session.selected_client_id;
    if (text.trim() === "1") {
      try {
        await fetchAndStoreInstaContent(null, waClient, chatId, client_id);
        await waClient.sendMessage(
          chatId,
          `✅ Selesai fetch Instagram untuk ${client_id}.`
        );
      } catch (e) {
        await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
    } else if (text.trim() === "2") {
      try {
        await handleFetchLikesInstagram(waClient, chatId, client_id);
        await waClient.sendMessage(
          chatId,
          `✅ Selesai fetch likes IG untuk ${client_id}.`
        );
      } catch (e) {
        await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
    } else if (text.trim() === "3") {
      session.step = "absensiLikes_choose_submenu";
      session.absensi_client_id = client_id;
      let msg = `Pilih tipe rekap absensi likes IG:\n1. Akumulasi (Semua)\n2. Hanya Sudah\n3. Hanya Belum\n4. Per Konten (Semua)\n5. Per Konten Sudah\n6. Per Konten Belum\nBalas angka di atas.`;
      await waClient.sendMessage(chatId, msg);
      return;
    } else {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka menu."
      );
    }
    session.step = "main";
  },

  // ================== PROSES TIKTOK (ALL) ==================
  prosesTiktok_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent,
    handleFetchKomentarTiktokBatch
  ) => {
    const rows = await pool.query(
      "SELECT client_id, nama FROM clients WHERE client_tiktok_status = true ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client TikTok aktif.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client TikTok Aktif*\nBalas angka untuk pilih client:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. ${c.client_id} - ${c.nama}\n`;
    });
    session.step = "prosesTiktok_action";
    await waClient.sendMessage(chatId, msg.trim());
  },
  prosesTiktok_action: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent,
    handleFetchKomentarTiktokBatch
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai list."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    session.selected_client_id = client_id;
    session.step = "prosesTiktok_menu";
    await waClient.sendMessage(
      chatId,
      `Proses TikTok untuk *${client_id}*:\n1️⃣ Fetch Konten TikTok\n2️⃣ Fetch Komentar TikTok\n3️⃣ Absensi Komentar TikTok\nBalas angka menu di atas atau *batal* untuk keluar.`
    );
  },
  prosesTiktok_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent,
    handleFetchKomentarTiktokBatch
  ) => {
    const client_id = session.selected_client_id;
    if (text.trim() === "1") {
      try {
        await fetchAndStoreTiktokContent(client_id);
        await waClient.sendMessage(
          chatId,
          `✅ Selesai fetch TikTok untuk ${client_id}.`
        );
      } catch (e) {
        await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
    } else if (text.trim() === "2") {
      try {
        await handleFetchKomentarTiktokBatch(waClient, chatId, client_id);
        await waClient.sendMessage(
          chatId,
          `✅ Selesai fetch komentar TikTok untuk ${client_id}.`
        );
      } catch (e) {
        await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
    } else if (text.trim() === "3") {
      session.step = "absensiKomentar_choose_submenu";
      session.absensi_client_id = client_id;
      let msg = `Pilih tipe rekap absensi komentar TikTok:\n1. Akumulasi (Semua)\n2. Hanya Sudah\n3. Hanya Belum\n4. Per Konten (Semua)\n5. Per Konten Sudah\n6. Per Konten Belum\nBalas angka di atas.`;
      await waClient.sendMessage(chatId, msg);
      return;
    } else {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka menu."
      );
    }
    session.step = "main";
  },

  // ================== ABSENSI USERNAME INSTAGRAM ==================
  absensiUsernameInsta_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    // Pilih client
    const rows = await pool.query(
      "SELECT client_id, nama FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client*\nBalas angka untuk pilih client:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. ${c.client_id} - ${c.nama}\n`;
    });
    session.step = "absensiUsernameInsta_submenu";
    await waClient.sendMessage(chatId, msg.trim());
  },
  absensiUsernameInsta_submenu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas angka sesuai list.");
      return;
    }
    const client_id = clients[idx].client_id;
    session.selected_client_id = client_id;
    session.step = "absensiUsernameInsta_menu";
    let msg = `Absensi Username IG untuk *${client_id}*\n1. Semua\n2. Sudah\n3. Belum\nBalas angka di atas!`;
    await waClient.sendMessage(chatId, msg);
  },
  absensiUsernameInsta_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    const client_id = session.selected_client_id;
    let mode = "all";
    if (text.trim() === "2") mode = "sudah";
    else if (text.trim() === "3") mode = "belum";
    else if (text.trim() !== "1") {
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas angka 1-3.");
      return;
    }
    const msg = await absensiUsernameInsta(client_id, userService, mode);
    await waClient.sendMessage(chatId, msg);
    session.step = "main";
  },

  // ================== ABSENSI USERNAME TIKTOK ==================
  absensiUsernameTiktok_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    // Pilih client
    const rows = await pool.query(
      "SELECT client_id, nama FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client*\nBalas angka untuk pilih client:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. ${c.client_id} - ${c.nama}\n`;
    });
    session.step = "absensiUsernameTiktok_submenu";
    await waClient.sendMessage(chatId, msg.trim());
  },
  absensiUsernameTiktok_submenu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas angka sesuai list.");
      return;
    }
    const client_id = clients[idx].client_id;
    session.selected_client_id = client_id;
    session.step = "absensiUsernameTiktok_menu";
    let msg = `Absensi Username TikTok untuk *${client_id}*\n1. Semua\n2. Sudah\n3. Belum\nBalas angka di atas!`;
    await waClient.sendMessage(chatId, msg);
  },
  absensiUsernameTiktok_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    const client_id = session.selected_client_id;
    let mode = "all";
    if (text.trim() === "2") mode = "sudah";
    else if (text.trim() === "3") mode = "belum";
    else if (text.trim() !== "1") {
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas angka 1-3.");
      return;
    }
    const msg = await absensiUsernameTiktok(client_id, userService, mode);
    await waClient.sendMessage(chatId, msg);
    session.step = "main";
  },

  // ================== ABSENSI LIKES INSTAGRAM ==================
  absensiLikes_choose_submenu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent
  ) => {
    const pilihan = parseInt(text.trim());
    const client_id = session.absensi_client_id;
    if (!client_id) {
      await waClient.sendMessage(chatId, "Client belum dipilih.");
      session.step = "main";
      return;
    }
    try {
      let msg = "";
      const absensiLikesPath = "../fetchAbsensi/insta/absensiLikesInsta.js";
      if ([1, 2, 3].includes(pilihan)) {
        const { absensiLikes } = await import(absensiLikesPath);
        if (pilihan === 1) msg = await absensiLikes(client_id, { mode: "all" });
        else if (pilihan === 2) msg = await absensiLikes(client_id, { mode: "sudah" });
        else if (pilihan === 3) msg = await absensiLikes(client_id, { mode: "belum" });
      } else if ([4, 5, 6].includes(pilihan)) {
        const { absensiLikesPerKonten } = await import(absensiLikesPath);
        if (pilihan === 4) msg = await absensiLikesPerKonten(client_id, { mode: "all" });
        else if (pilihan === 5) msg = await absensiLikesPerKonten(client_id, { mode: "sudah" });
        else if (pilihan === 6) msg = await absensiLikesPerKonten(client_id, { mode: "belum" });
      } else {
        await waClient.sendMessage(
          chatId,
          "Pilihan tidak valid. Balas angka 1-6."
        );
        return;
      }
      await waClient.sendMessage(chatId, msg || "Data tidak ditemukan.");
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
  },

  // ================== ABSENSI KOMENTAR TIKTOK ==================
  absensiKomentar_choose_submenu: async (
    session,
    chatId,
    text,
    waClient
  ) => {
    const pilihan = parseInt(text.trim());
    const client_id = session.absensi_client_id;
    if (!client_id) {
      await waClient.sendMessage(chatId, "Client belum dipilih.");
      session.step = "main";
      return;
    }
    try {
      let msg = "";
      if ([1, 2, 3].includes(pilihan)) {
        if (pilihan === 1) msg = await absensiKomentar(client_id, { mode: "all" });
        else if (pilihan === 2) msg = await absensiKomentar(client_id, { mode: "sudah" });
        else if (pilihan === 3) msg = await absensiKomentar(client_id, { mode: "belum" });
      } else if ([4, 5, 6].includes(pilihan)) {
        if (pilihan === 4) msg = await absensiKomentarTiktokPerKonten(client_id, { mode: "all" });
        else if (pilihan === 5) msg = await absensiKomentarTiktokPerKonten(client_id, { mode: "sudah" });
        else if (pilihan === 6) msg = await absensiKomentarTiktokPerKonten(client_id, { mode: "belum" });
      } else {
        await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas angka 1-6.");
        return;
      }
      await waClient.sendMessage(chatId, msg || "Data tidak ditemukan.");
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
  },

  // ================== LAINNYA ==================
  lainnya_menu: async (session, chatId, text, waClient) => {
    await waClient.sendMessage(chatId, "Fitur lain belum tersedia.");
    session.step = "main";
  },
};

export default clientRequestHandlers;

