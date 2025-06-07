import { handleFetchLikesInstagram } from "../fetchEngagement/fetchLikesInstagram.js";
import { formatClientInfo } from "../../utils/utilsHelper.js";
// Import fungsi absensi TikTok Komentar
// Import di atas file handler, misal:
import {
  absensiKomentarTiktokAkumulasi50,
  absensiKomentarTiktokPerKonten,
} from "../fetchAbsensi/tiktok/absensiKomentarTiktok.js";

// Main handler untuk request client

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
    fetchAndStoreLikesInstaContent, // handler likes IG
    handleFetchKomentarTiktokBatch // handler batch fetch komentar TikTok!
  ) => {
    switch (text) {
      case "1":
        session.step = "addClient_id";
        await waClient.sendMessage(
          chatId,
          "Masukkan *client_id* untuk client baru:"
        );
        return;
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
      case "10":
      case "11":
      case "12":
      case "17":
      case "18": {
        // Ambil semua client (aktif & tidak aktif)
        const rows = await pool.query(
          "SELECT client_id, nama, client_status FROM clients ORDER BY client_id"
        );
        const clients = rows.rows;
        if (!clients.length) {
          await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
          return;
        }
        session.clientList = clients;
        // Step map sesuai menu
        const stepMap = {
          2: "updateClient_choose",
          3: "removeClient_choose",
          4: "infoClient_choose",
          5: "transferUser_choose",
          6: "sheetTransfer_choose",
          7: "fetchInsta_choose",
          8: "fetchTiktok_choose",
          9: "fetchLikesInsta_choose",
          10: "fetchKomentarTiktok_choose", // Handler batch komentar TikTok!
          11: "absensiLikes_choose",
          12: "absensiKomentar_choose",
          17: "requestInsta_choose",
          18: "requestTiktok_choose",
        };
        session.step = stepMap[text];
        let msg = `*Daftar Client (Semua Status)*\nBalas angka untuk memilih client:\n`;
        clients.forEach((c, i) => {
          msg += `${i + 1}. ${c.client_id} - ${c.nama} ${
            c.client_status ? "✅" : "❌"
          }\n`;
        });
        await waClient.sendMessage(chatId, msg.trim());
        return;
      }

      case "13":
        session.step = "manualCommandList";
        await waClient.sendMessage(
          chatId,
          "(Lihat daftar command manual seperti handler lama)"
        );
        return;
      case "14":
        session.step = "updateUserException_id";
        await waClient.sendMessage(
          chatId,
          "Masukkan *user_id* yang akan di-update exception-nya:"
        );
        return;
      case "15":
        session.step = "updateUserStatus_id";
        await waClient.sendMessage(
          chatId,
          "Masukkan *user_id* yang akan di-update status-nya:"
        );
        return;
      case "16":
        try {
          const exceptionUsers = await userService.getAllExceptionUsers();
          if (!exceptionUsers.length) {
            await waClient.sendMessage(
              chatId,
              "Tidak ada user dengan exception."
            );
          } else {
            let msg = `*Daftar User Exception:*\n`;
            exceptionUsers.forEach((u) => {
              msg += `- ${u.user_id}: ${u.nama || ""} (${
                u.insta || u.tiktok || "-"
              })\n`;
            });
            await waClient.sendMessage(chatId, msg);
          }
        } catch (e) {
          await waClient.sendMessage(
            chatId,
            "Gagal mengambil data exception: " + e.message
          );
        }
        return;
      default:
        await waClient.sendMessage(
          chatId,
          "Pilihan tidak valid. Balas angka 1-18, atau *batal* untuk keluar."
        );
        return;
    }
  },

  // ====== Add Client ======
  addClient_id: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService
  ) => {
    const client_id = text.trim().toUpperCase();
    session.addClient_id = client_id;
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

  // ====== Update Client ======
  updateClient_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService
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
    session.targetClient_id = clients[idx].client_id;
    session.step = "updateClient_field";
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
  },
  updateClient_field: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService
  ) => {
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
    session.step = "updateClient_value";
    await waClient.sendMessage(
      chatId,
      `Masukkan value baru untuk *${fields[idx].label}* (key: ${fields[idx].key})\nUntuk boolean, isi dengan true/false:`
    );
  },
  updateClient_value: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    ...deps
  ) => {
    try {
      const updated = await clientService.updateClient(
        session.targetClient_id,
        { [session.updateField]: text.trim() }
      );
      if (updated) {
        await waClient.sendMessage(
          chatId,
          `✅ Update berhasil:\n${JSON.stringify(updated, null, 2)}`
        );
      } else {
        await waClient.sendMessage(
          chatId,
          "❌ Client tidak ditemukan atau update gagal."
        );
      }
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
  },

  // ====== Remove Client ======
  removeClient_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService
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
    try {
      const removed = await clientService.deleteClient(client_id);
      if (removed) {
        await waClient.sendMessage(
          chatId,
          `🗑️ Client ${client_id} berhasil dihapus.\n${JSON.stringify(
            removed,
            null,
            2
          )}`
        );
      } else {
        await waClient.sendMessage(chatId, "❌ Client tidak ditemukan.");
      }
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
  },

  // ====== Info Client ======
  infoClient_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    ...deps
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
    try {
      const client = await clientService.findClientById(client_id);
      if (client) {
        await waClient.sendMessage(chatId, formatClientInfo(client));
      } else {
        await waClient.sendMessage(chatId, "❌ Client tidak ditemukan.");
      }
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
  },

  // ====== Transfer User ======
  transferUser_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    migrateUsersFromFolder
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
    await waClient.sendMessage(
      chatId,
      `⏳ Migrasi user dari user_data/${client_id}/ ...`
    );
    try {
      const result = await migrateUsersFromFolder(client_id);
      let report = `*Hasil transfer user dari client ${client_id}:*\n`;
      result.forEach((r) => {
        report += `- ${r.file}: ${r.status}${
          r.error ? " (" + r.error + ")" : ""
        }\n`;
      });
      await waClient.sendMessage(chatId, report);
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal proses transfer: ${err.message}`
      );
    }
    session.step = "main";
  },

  // ====== Sheet Transfer ======
  sheetTransfer_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    _,
    checkGoogleSheetCsvStatus
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
    session.sheetTransfer_client_id = clients[idx].client_id;
    session.step = "sheetTransfer_link";
    await waClient.sendMessage(chatId, "Masukkan link Google Sheet:");
  },
  sheetTransfer_link: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    _,
    __,
    importUsersFromGoogleSheet,
    checkGoogleSheetCsvStatus
  ) => {
    const sheetUrl = text.trim();
    const client_id = session.sheetTransfer_client_id;
    try {
      const check = await checkGoogleSheetCsvStatus(sheetUrl);
      if (!check.ok) {
        await waClient.sendMessage(
          chatId,
          `❌ Sheet tidak bisa diakses:\n${check.reason}`
        );
      } else {
        await waClient.sendMessage(
          chatId,
          "⏳ Mengambil & migrasi data dari Google Sheet..."
        );
        const result = await importUsersFromGoogleSheet(sheetUrl, client_id);
        let report = `*Hasil import user ke client ${client_id}:*\n`;
        result.forEach((r) => {
          report += `- ${r.user_id}: ${r.status}${
            r.error ? " (" + r.error + ")" : ""
          }\n`;
        });
        await waClient.sendMessage(chatId, report);
      }
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
  },

  // ====== Fetch Instagram ======
  fetchInsta_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    _,
    __,
    ___,
    fetchAndStoreInstaContent
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
    try {
      await fetchAndStoreInstaContent(null, waClient, chatId, client_id);
      await waClient.sendMessage(
        chatId,
        `✅ Selesai fetch Instagram untuk ${client_id}.`
      );
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
  },

  // ====== Fetch TikTok ======
  fetchTiktok_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService,
    clientService,
    _,
    __,
    ___,
    ____,
    fetchAndStoreTiktokContent
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
    await waClient.sendMessage(
      chatId,
      `⏳ Memulai fetch TikTok untuk *${client_id}* ...`
    );
    try {
      await fetchAndStoreTiktokContent(client_id);
      await waClient.sendMessage(
        chatId,
        `✅ Selesai fetch TikTok untuk ${client_id}.`
      );
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error fetch TikTok: ${e.message}`);
    }
    session.step = "main";
  },

  // ====== Update User Exception ======
  updateUserException_id: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    session.target_user_id = text.trim();
    session.step = "updateUserException_value";
    await waClient.sendMessage(
      chatId,
      "Ketik *true* untuk exception, *false* untuk batal exception:"
    );
  },
  updateUserException_value: async (
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

  // ====== Update User Status ======
  updateUserStatus_id: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    session.target_user_id = text.trim();
    session.step = "updateUserStatus_value";
    await waClient.sendMessage(
      chatId,
      "Ketik *true* untuk aktif, *false* untuk non-aktif:"
    );
  },
  updateUserStatus_value: async (
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
        "user_status",
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

  // Step pilih client untuk fetch post IG (7)
  fetchInsta_choose: async (
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
    fetchAndStoreInstaContent
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
    await waClient.sendMessage(
      chatId,
      `⏳ Memulai fetch konten IG untuk ${client_id}...`
    );
    try {
      await fetchAndStoreInstaContent(null, waClient, chatId, client_id); // pass client_id jika handler support
      await waClient.sendMessage(
        chatId,
        `✅ Selesai fetch IG untuk ${client_id}.`
      );
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error fetch IG: ${e.message}`);
    }
    session.step = "main";
  },

  // Step pilih client untuk fetch likes IG (17)
  fetchLikesInsta_choose: async (
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
    await waClient.sendMessage(
      chatId,
      `⏳ Memulai fetch likes IG untuk ${client_id}...`
    );
    try {
      await handleFetchLikesInstagram(waClient, chatId, client_id); // dari fetchLikesInstagram.js
      await waClient.sendMessage(
        chatId,
        `✅ Selesai fetch likes IG untuk ${client_id}.`
      );
    } catch (e) {
      await waClient.sendMessage(
        chatId,
        `❌ Error fetch likes IG: ${e.message}`
      );
    }
    session.step = "main";
  },

  // Step pilih client untuk absensi likes IG (9)
  absensiLikes_choose: async (
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
    // tambahkan dependency handler jika perlu
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
    session.absensi_client_id = client_id; // simpan ke session
    session.step = "absensiLikes_choose_submenu";
    let msg = `Pilih tipe rekap absensi likes:\n`;
    msg += `1. Akumulasi (Sudah & Belum)\n`;
    msg += `2. Akumulasi Sudah\n`;
    msg += `3. Akumulasi Belum\n`;
    msg += `4. Per Konten (Sudah & Belum)\n`;
    msg += `5. Per Konten Sudah\n`;
    msg += `6. Per Konten Belum\n`;
    msg += `\nBalas angka di atas.`;
    await waClient.sendMessage(chatId, msg);
  },
  // Submenu untuk absensi likes IG
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
    // tambahkan dependency handler jika perlu
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
        // Akumulasi
        const { absensiLikes } = await import(absensiLikesPath);
        if (pilihan === 1) {
          msg = await absensiLikes(client_id, { mode: "all" });
        } else if (pilihan === 2) {
          msg = await absensiLikes(client_id, { mode: "sudah" });
        } else if (pilihan === 3) {
          msg = await absensiLikes(client_id, { mode: "belum" });
        }
      } else if ([4, 5, 6].includes(pilihan)) {
        // Per konten
        const { absensiLikesPerKonten } = await import(absensiLikesPath);
        if (pilihan === 4) {
          msg = await absensiLikesPerKonten(client_id, { mode: "all" });
        } else if (pilihan === 5) {
          msg = await absensiLikesPerKonten(client_id, { mode: "sudah" });
        } else if (pilihan === 6) {
          msg = await absensiLikesPerKonten(client_id, { mode: "belum" });
        }
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

  // ====== Fetch Komentar TikTok ======
  fetchKomentarTiktok_choose: async (
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
    handleFetchKomentarTiktokBatch // ← batch handler yang benar!
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
    await waClient.sendMessage(
      chatId,
      `⏳ Memulai fetch komentar TikTok untuk ${client_id}...`
    );
    try {
      await handleFetchKomentarTiktokBatch(waClient, chatId, client_id);
      await waClient.sendMessage(
        chatId,
        `✅ Selesai fetch komentar TikTok untuk ${client_id}.`
      );
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
  },
  // --- Submenu step untuk Request Instagram (case 17) ---
  // === Request Instagram (menu 17) ===
  requestInsta_choose: async (session, chatId, text, waClient, pool) => {
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
    session.step = "requestInsta_status_submenu";
    await waClient.sendMessage(
      chatId,
      `Pilih salah satu:\n1️⃣ Sudah mengisi Instagram\n2️⃣ Belum mengisi Instagram`
    );
  },

  requestInsta_status_submenu: async (session, chatId, text, waClient) => {
    if (!session.selected_client_id) {
      await waClient.sendMessage(
        chatId,
        "Session client tidak valid, ulangi dari awal."
      );
      session.step = "main";
      return;
    }
    let status = null;
    if (text.trim() === "1") status = "sudah";
    else if (text.trim() === "2") status = "belum";
    else {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas 1 untuk Sudah, 2 untuk Belum."
      );
      return;
    }
    // Simulasi emit handler (atau panggil langsung fungsi requestInsta, jika mau)
    waClient.emit("message", {
      from: chatId,
      body: `requestinsta#${session.selected_client_id}#${status}`,
    });
    session.step = "main";
  },

  // === Request TikTok (menu 18) ===
  requestTiktok_choose: async (session, chatId, text, waClient, pool) => {
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
    session.step = "requestTiktok_status_submenu";
    await waClient.sendMessage(
      chatId,
      `Pilih salah satu:\n1️⃣ Sudah mengisi TikTok\n2️⃣ Belum mengisi TikTok`
    );
  },

  requestTiktok_status_submenu: async (session, chatId, text, waClient) => {
    if (!session.selected_client_id) {
      await waClient.sendMessage(
        chatId,
        "Session client tidak valid, ulangi dari awal."
      );
      session.step = "main";
      return;
    }
    let status = null;
    if (text.trim() === "1") status = "sudah";
    else if (text.trim() === "2") status = "belum";
    else {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas 1 untuk Sudah, 2 untuk Belum."
      );
      return;
    }
    waClient.emit("message", {
      from: chatId,
      body: `requesttiktok#${session.selected_client_id}#${status}`,
    });
    session.step = "main";
  },

  // Handler submenu (sederhana, tinggal copy logic dari absensiLikes_choose_submenu)
  absensiKomentar_choose: async (
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
    // tambahkan dependency handler jika perlu
  ) => {
    // Langkah pemilihan client
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
    session.absensi_client_id = client_id; // simpan ke session
    session.step = "absensiKomentar_choose_submenu";
    let msg = `Pilih tipe rekap absensi komentar TikTok:\n`;
    msg += `1. Akumulasi minimal 50% (Sudah & Belum)\n`;
    msg += `2. Akumulasi Sudah (min. 50%)\n`;
    msg += `3. Akumulasi Belum (kurang dari 50%)\n`;
    msg += `4. Per Konten (Sudah & Belum)\n`;
    msg += `5. Per Konten Sudah\n`;
    msg += `6. Per Konten Belum\n`;
    msg += `\nBalas angka di atas.`;
    await waClient.sendMessage(chatId, msg);
  },

  absensiKomentar_choose_submenu: async (
    session,
    chatId,
    text,
    waClient
    // dependency lain jika butuh, misal: pool, userService, dst
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
      // Akumulasi 50%
      if ([1, 2, 3].includes(pilihan)) {
        if (pilihan === 1) {
          msg = await absensiKomentarTiktokAkumulasi50(client_id, {
            mode: "all",
          });
        } else if (pilihan === 2) {
          msg = await absensiKomentarTiktokAkumulasi50(client_id, {
            mode: "sudah",
          });
        } else if (pilihan === 3) {
          msg = await absensiKomentarTiktokAkumulasi50(client_id, {
            mode: "belum",
          });
        }
      }
      // Per konten
      else if ([4, 5, 6].includes(pilihan)) {
        if (pilihan === 4) {
          msg = await absensiKomentarTiktokPerKonten(client_id, {
            mode: "all",
          });
        } else if (pilihan === 5) {
          msg = await absensiKomentarTiktokPerKonten(client_id, {
            mode: "sudah",
          });
        } else if (pilihan === 6) {
          msg = await absensiKomentarTiktokPerKonten(client_id, {
            mode: "belum",
          });
        }
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

  // ... handler lain tetap sama ...
};
