// src/handler/menu/clientRequestHandlers.js

import { handleFetchLikesInstagram } from "../fetchengagement/fetchLikesInstagram.js";
import { formatClientInfo } from "../../utils/utilsHelper.js";
import {
  groupByDivision,
  sortDivisionKeys,
  formatNama,
} from "../../utils/utilsHelper.js";
import { absensiRegistrasiDashboardDitbinmas } from "../fetchabsensi/dashboard/absensiRegistrasiDashboardDitbinmas.js";
import { getAdminWANumbers, getAdminWAIds, sendWAFile } from "../../utils/waHelper.js";
import * as linkReportModel from "../../model/linkReportModel.js";
import { saveLinkReportExcel } from "../../service/linkReportExcelService.js";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { mdToPdf } from "md-to-pdf";
import { query } from "../../db/index.js";
import { saveContactIfNew } from "../../service/googleContactsService.js";
import { formatToWhatsAppId } from "../../utils/waHelper.js";

function ignore(..._args) {}

async function collectMarkdownFiles(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const res = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownFiles(res, files);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(res);
    }
  }
  return files;
}

async function buildDocsPdf(rootDir, filename) {
  const files = await collectMarkdownFiles(rootDir);
  if (!files.length) throw new Error("Tidak ada file Markdown ditemukan.");
  files.sort();
  const parts = [];
  for (const file of files) {
    const name = path.basename(file);
    const content = await fs.readFile(file, "utf8");
    if (parts.length)
      parts.push("\n<div style=\"page-break-before: always;\"></div>\n");
    parts.push(`# ${name}\n\n${content}\n`);
  }
  const mdContent = parts.join("\n");
  const pdf = await mdToPdf({ content: mdContent });
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "docs-"));
  const pdfPath = path.join(tmpDir, filename);
  await fs.writeFile(pdfPath, pdf.content);
  const buffer = await fs.readFile(pdfPath);
  try {
    await fs.unlink(pdfPath);
    await fs.rmdir(tmpDir);
  } catch (e) {
    ignore(e);
  }
  return buffer;
}

async function absensiUsernameInsta(client_id, userModel, mode = "all") {
  let sudah = [], belum = [];
  if (mode === "sudah") {
    sudah = await userModel.getInstaFilledUsersByClient(client_id);
  } else if (mode === "belum") {
    belum = await userModel.getInstaEmptyUsersByClient(client_id);
  } else {
    sudah = await userModel.getInstaFilledUsersByClient(client_id);
    belum = await userModel.getInstaEmptyUsersByClient(client_id);
  }

  let msg = `*Absensi Username Instagram*\nClient: *${client_id}*`;

  // Sudah mengisi IG
  if (mode === "all" || mode === "sudah") {
    msg += `\n\n*Sudah mengisi IG* (${sudah.length}):`;
    if (sudah.length) {
      const byDiv = groupByDivision(sudah);
      const keys = sortDivisionKeys(Object.keys(byDiv));
      keys.forEach((div, idx) => {
        if (idx > 0) msg += `\n─────`; // pisahkan antar satfung
        msg += `\n• *${div}* (${byDiv[div].length})\n`;
        msg += byDiv[div]
          .map((u, i) => `  ${i + 1}. ${u.nama} (${u.user_id}) @${u.insta}`)
          .join("\n");
      });
    } else {
      msg += `\n-`;
    }
  }

  if (mode === "all") msg += "\n";

  // Belum mengisi IG
  if (mode === "all" || mode === "belum") {
    msg += `\n*Belum mengisi IG* (${belum.length}):`;
    if (belum.length) {
      const byDiv = groupByDivision(belum);
      const keys = sortDivisionKeys(Object.keys(byDiv));
      keys.forEach((div, idx) => {
        if (idx > 0) msg += `\n─────`; // pisahkan antar satfung
        msg += `\n• *${div}* (${byDiv[div].length})\n`;
        msg += byDiv[div]
          .map((u, i) => `  ${i + 1}. ${u.nama} (${u.user_id})`)
          .join("\n");
      });
    } else {
      msg += `\n-`;
    }
  }
  return msg;
}

async function absensiUsernameTiktok(client_id, userModel, mode = "all") {
  let sudah = [], belum = [];
  if (mode === "sudah") {
    sudah = await userModel.getTiktokFilledUsersByClient(client_id);
  } else if (mode === "belum") {
    belum = await userModel.getTiktokEmptyUsersByClient(client_id);
  } else {
    sudah = await userModel.getTiktokFilledUsersByClient(client_id);
    belum = await userModel.getTiktokEmptyUsersByClient(client_id);
  }

  let msg = `*Absensi Username TikTok*\nClient: *${client_id}*`;

  if (mode === "all" || mode === "sudah") {
    msg += `\n\n*Sudah mengisi TikTok* (${sudah.length}):`;
    if (sudah.length) {
      const byDiv = groupByDivision(sudah);
      const keys = sortDivisionKeys(Object.keys(byDiv));
      keys.forEach((div, idx) => {
        if (idx > 0) msg += `\n─────`; // pisahkan antar satfung
        msg += `\n• *${div}* (${byDiv[div].length})\n`;
        msg += byDiv[div]
          .map((u, i) => `  ${i + 1}. ${u.nama} (${u.user_id}) @${u.tiktok}`)
          .join("\n");
      });
    } else {
      msg += `\n-`;
    }
  }

  if (mode === "all") msg += "\n";

  if (mode === "all" || mode === "belum") {
    msg += `\n*Belum mengisi TikTok* (${belum.length}):`;
    if (belum.length) {
      const byDiv = groupByDivision(belum);
      const keys = sortDivisionKeys(Object.keys(byDiv));
      keys.forEach((div, idx) => {
        if (idx > 0) msg += `\n─────`; // pisahkan antar satfung
        msg += `\n• *${div}* (${byDiv[div].length})\n`;
        msg += byDiv[div]
          .map((u, i) => `  ${i + 1}. ${u.nama} (${u.user_id})`)
          .join("\n");
      });
    } else {
      msg += `\n-`;
    }
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
    userModel,
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
6️⃣ Absensi Username Instagram
7️⃣ Absensi Username TikTok
8️⃣ Transfer User
9️⃣ Exception Info
🔟 Hapus WA Admin
1️⃣1️⃣ Hapus WA User
1️⃣2️⃣ Transfer User Sheet
1️⃣3️⃣ Download Sheet Amplifikasi
1️⃣4️⃣ Download Sheet Amplifikasi Bulan sebelumnya
1️⃣5️⃣ Download Docs
1️⃣6️⃣ Absensi Operator Ditbinmas
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Ketik *angka* menu, atau *batal* untuk keluar.
  `.trim();
    if (!/^([1-9]|1[0-6])$/.test(text.trim())) {
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
      6: "absensiUsernameInsta_choose",
      7: "absensiUsernameTiktok_choose",
      8: "transferUser_choose",
      9: "exceptionInfo_chooseClient",
      10: "hapusWAAdmin_confirm",
      11: "hapusWAUser_start",
      12: "transferUserSheet_choose",
      13: "downloadSheet_choose",
      14: "downloadSheetPrev_choose",
      15: "downloadDocs_choose",
      16: "absensiOprDitbinmas",
    };
    session.step = mapStep[text.trim()];
    await clientRequestHandlers[session.step](
      session,
      chatId,
      "",
      waClient,
      pool,
      userModel,
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
    if (!text.trim()) {
      session.step = "addClient_id";
      await waClient.sendMessage(chatId, "Masukkan *ID* client:");
      return;
    }
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
    userModel,
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
    userModel,
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
    userModel,
    clientService
  ) => {
    const rows = await query(
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
      msg += `${i + 1}. *${c.client_id}* - ${c.nama} ${
        c.client_status ? "🟢 Aktif" : "🔴 Tidak Aktif"
      }\n`;
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
    userModel,
    clientService
  ) => {
    if (text.trim() === "1") {
      session.step = "kelolaClient_updatefield";
      const fields = [
        { key: "client_insta", label: "Username Instagram" },
        { key: "client_operator", label: "Operator Client" },
        { key: "client_super", label: "Super Admin Client" },
        { key: "client_group", label: "Group Client" },
        { key: "tiktok_secuid", label: "TikTok SecUID" },
        { key: "client_tiktok", label: "Username TikTok" },
        { key: "client_status", label: "Status Aktif (true/false)" },
        { key: "client_insta_status", label: "Status IG Aktif (true/false)" },
        {
          key: "client_tiktok_status",
          label: "Status TikTok Aktif (true/false)",
        },
        {
          key: "client_amplify_status",
          label: "Status Amplifikasi (true/false)",
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
      // Info client, tampilkan status Aktif/Nonaktif
      const client = await clientService.findClientById(
        session.selected_client_id
      );
      if (client) {
        let statusLine = client.client_status ? "🟢 Aktif" : "🔴 Tidak Aktif";
        let infoMsg =
          `*${client.client_id}*\n` +
          `_${client.nama}_\n` +
          `${statusLine}\n\n` +
          formatClientInfo(client);
        await waClient.sendMessage(chatId, infoMsg.trim());
      } else {
        await waClient.sendMessage(chatId, "❌ Client tidak ditemukan.");
      }
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
    userModel,
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
          ? `✅ Update berhasil.\n${formatClientInfo(updated)}`
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
    userModel
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
    userModel
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
    userModel
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
    userModel
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
    userModel
  ) => {
    try {
      const value = text.trim();
      await userModel.updateUserField(
        session.target_user_id,
        session.updateField,
        value
      );
      if (session.updateField === "whatsapp" && value) {
        await saveContactIfNew(formatToWhatsAppId(value));
      }
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
    userModel
  ) => {
    try {
      const newException = text.trim().toLowerCase() === "true";
      await userModel.updateUserField(
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
    userModel
  ) => {
    try {
      const newStatus = text.trim().toLowerCase() === "true";
      await userModel.updateUserField(
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
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent
  ) => {
    // List client IG aktif, tapi tampilkan juga status
    const rows = await query(
      "SELECT client_id, nama, client_insta_status FROM clients ORDER BY client_id"
    );
    // Filter yang IG aktif
    const clients = rows.rows.filter((c) => c.client_insta_status);
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client IG aktif.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client IG Aktif*\nBalas angka untuk pilih client:\n\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n   ${
        c.client_insta_status ? "🟢 Aktif" : "🔴 Nonaktif"
      }\n\n`;
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
    userModel,
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
    userModel,
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
    userModel,
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
    // Ambil status juga untuk emoji
    const rows = await query(
      "SELECT client_id, nama, client_tiktok_status FROM clients ORDER BY client_id"
    );
    // Hanya tampilkan yang TikTok aktif (atau bisa filter di SQL)
    const clients = rows.rows.filter((c) => c.client_tiktok_status);
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client TikTok aktif.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client TikTok Aktif*\nBalas angka untuk pilih client:\n\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n   ${
        c.client_tiktok_status ? "🟢 Aktif" : "🔴 Nonaktif"
      }\n\n`;
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
    userModel,
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
    userModel,
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
    userModel
  ) => {
    // Pilih client (tambahkan client_status di query)
    const rows = await query(
      "SELECT client_id, nama, client_status FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client*\nBalas angka untuk pilih client:\n\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n   ${
        c.client_status ? "🟢 Aktif" : "🔴 Nonaktif"
      }\n\n`;
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
    userModel
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
    userModel
  ) => {
    const client_id = session.selected_client_id;
    let mode = "all";
    if (text.trim() === "2") mode = "sudah";
    else if (text.trim() === "3") mode = "belum";
    else if (text.trim() !== "1") {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka 1-3."
      );
      return;
    }
    const msg = await absensiUsernameInsta(client_id, userModel, mode);
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
    userModel
  ) => {
    // Ambil semua client, sertakan status aktif
    const rows = await query(
      "SELECT client_id, nama, client_status FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client*\nBalas angka untuk pilih client:\n\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n   ${
        c.client_status ? "🟢 Aktif" : "🔴 Nonaktif"
      }\n\n`;
    });
    session.step = "absensiUsernameTiktok_submenu";
    await waClient.sendMessage(chatId, msg.trim());
  },

  absensiUsernameTiktok_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    const client_id = session.selected_client_id;
    let mode = "all";
    if (text.trim() === "2") mode = "sudah";
    else if (text.trim() === "3") mode = "belum";
    else if (text.trim() !== "1") {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka 1-3."
      );
      return;
    }
    const msg = await absensiUsernameTiktok(client_id, userModel, mode);
    await waClient.sendMessage(chatId, msg);
    session.step = "main";
  },

  absensiUsernameTiktok_submenu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
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
    session.step = "absensiUsernameTiktok_menu";
    let msg = `Absensi Username TikTok untuk *${client_id}*\n1. Semua\n2. Sudah\n3. Belum\nBalas angka di atas!`;
    await waClient.sendMessage(chatId, msg);
  },

  // ================== ABSENSI LIKES INSTAGRAM ==================
  absensiLikes_choose_submenu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
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
      const absensiLikesPath = "../fetchabsensi/insta/absensiLikesInsta.js";
      if ([1, 2, 3].includes(pilihan)) {
        const { absensiLikes } = await import(absensiLikesPath);
        if (pilihan === 1) msg = await absensiLikes(client_id, { mode: "all" });
        else if (pilihan === 2)
          msg = await absensiLikes(client_id, { mode: "sudah" });
        else if (pilihan === 3)
          msg = await absensiLikes(client_id, { mode: "belum" });
      } else if ([4, 5, 6].includes(pilihan)) {
        const { absensiLikesPerKonten } = await import(absensiLikesPath);
        if (pilihan === 4)
          msg = await absensiLikesPerKonten(client_id, { mode: "all" });
        else if (pilihan === 5)
          msg = await absensiLikesPerKonten(client_id, { mode: "sudah" });
        else if (pilihan === 6)
          msg = await absensiLikesPerKonten(client_id, { mode: "belum" });
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
  absensiKomentar_choose_submenu: async (session, chatId, text, waClient) => {
    const pilihan = parseInt(text.trim());
    const client_id = session.absensi_client_id;
    if (!client_id) {
      await waClient.sendMessage(chatId, "Client belum dipilih.");
      session.step = "main";
      return;
    }
    try {
      let msg = "";
      const absensiKomentarPath =
        "../fetchabsensi/tiktok/absensiKomentarTiktok.js";
      if ([1, 2, 3].includes(pilihan)) {
        const { absensiKomentar } = await import(absensiKomentarPath);
        if (pilihan === 1)
          msg = await absensiKomentar(client_id, { mode: "all" });
        else if (pilihan === 2)
          msg = await absensiKomentar(client_id, { mode: "sudah" });
        else if (pilihan === 3)
          msg = await absensiKomentar(client_id, { mode: "belum" });
      } else if ([4, 5, 6].includes(pilihan)) {
        const { absensiKomentarTiktokPerKonten } = await import(
          absensiKomentarPath
        );
        if (pilihan === 4)
          msg = await absensiKomentarTiktokPerKonten(client_id, {
            mode: "all",
          });
        else if (pilihan === 5)
          msg = await absensiKomentarTiktokPerKonten(client_id, {
            mode: "sudah",
          });
        else if (pilihan === 6)
          msg = await absensiKomentarTiktokPerKonten(client_id, {
            mode: "belum",
          });
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

  // ================== TRANSFER USER FROM FOLDER ==================
  transferUser_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool
  ) => {
    const rows = await query(
      "SELECT client_id, nama FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client*\nBalas angka untuk memilih:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "transferUser_action";
  },
  transferUser_action: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai daftar."
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
          r.error ? " (" + r.error + ")" : ""}\n`;
      });

      if (result.length > 0 && result.every((r) => r.status === "✅ Sukses")) {
        report += "\n🎉 Semua user berhasil ditransfer!";
      }
      if (result.length === 0) {
        report += "\n(Tidak ada file user yang ditemukan atau diproses)";
      }

      await waClient.sendMessage(chatId, report);
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal proses transfer: ${err.message}`
      );
    }
    session.step = "main";
  },

  // ================== TRANSFER USER VIA SHEET ==================
  transferUserSheet_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool
  ) => {
    const rows = await query(
      "SELECT client_id, nama FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client*\nBalas angka untuk memilih:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "transferUserSheet_link";
  },
  transferUserSheet_link: async (
    session,
    chatId,
    text,
    waClient,
    pool
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai daftar."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    session.transferSheetClientId = client_id;
    await waClient.sendMessage(
      chatId,
      `Kirim link Google Sheet untuk transfer user ke *${client_id}*:`
    );
    session.step = "transferUserSheet_action";
  },
  transferUserSheet_action: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet
  ) => {
    const sheetUrl = text.trim();
    const client_id = session.transferSheetClientId;
    const check = await checkGoogleSheetCsvStatus(sheetUrl);
    if (!check.ok) {
      await waClient.sendMessage(
        chatId,
        `❌ Sheet tidak bisa diakses:\n${check.reason}`
      );
      return;
    }
    await waClient.sendMessage(
      chatId,
      `⏳ Mengambil & migrasi data dari Google Sheet...`
    );
    try {
      const result = await importUsersFromGoogleSheet(sheetUrl, client_id);
      let report = `*Hasil import user ke client ${client_id}:*\n`;
      result.forEach((r) => {
        report += `- ${r.user_id}: ${r.status}${
          r.error ? " (" + r.error + ")" : ""}\n`;
      });
      if (result.length > 0 && result.every((r) => r.status === "✅ Sukses")) {
        report += "\n🎉 Semua user berhasil ditransfer!";
      }
      if (result.length === 0) {
        report += "\n(Tidak ada data user pada sheet)";
      }
      await waClient.sendMessage(chatId, report);
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal import: ${err.message}`);
    }
    session.step = "main";
  },

  // ================== DOWNLOAD SHEET AMPLIFIKASI ==================
  downloadSheet_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool
  ) => {
    const rows = await query(
      "SELECT client_id, nama FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client*\nBalas angka untuk memilih:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "downloadSheet_action";
  },
  downloadSheet_action: async (
    session,
    chatId,
    text,
    waClient
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai daftar."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    session.step = "main";
    await waClient.sendMessage(chatId, "⏳ Menyiapkan file Excel...");
    try {
      const rows = await linkReportModel.getReportsThisMonthByClient(client_id);
      const monthName = new Date().toLocaleString("id-ID", {
        month: "long",
        timeZone: "Asia/Jakarta"
      });
      const filePath = await saveLinkReportExcel(rows, client_id, monthName);
      const buffer = await fs.readFile(filePath);
      await sendWAFile(
        waClient,
        buffer,
        path.basename(filePath),
        getAdminWAIds(),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      await waClient.sendMessage(chatId, "✅ File Excel dikirim ke admin.");
      await fs.unlink(filePath);
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal membuat Excel: ${err.message}`);
      console.error(err);
    }
  },

  // =========== DOWNLOAD SHEET AMPLIFIKASI BULAN SEBELUMNYA ===========
  downloadSheetPrev_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool
  ) => {
    const rows = await query(
      "SELECT client_id, nama FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client*\nBalas angka untuk memilih:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "downloadSheetPrev_action";
  },
  downloadSheetPrev_action: async (
    session,
    chatId,
    text,
    waClient
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai daftar."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    session.step = "main";
    await waClient.sendMessage(chatId, "⏳ Menyiapkan file Excel...");
    try {
      const rows = await linkReportModel.getReportsPrevMonthByClient(client_id);
      const date = new Date();
      date.setMonth(date.getMonth() - 1);
      const monthName = date.toLocaleString("id-ID", {
        month: "long",
        timeZone: "Asia/Jakarta",
      });
      const filePath = await saveLinkReportExcel(rows, client_id, monthName);
      const buffer = await fs.readFile(filePath);
      await sendWAFile(
        waClient,
        buffer,
        path.basename(filePath),
        getAdminWAIds(),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      await waClient.sendMessage(chatId, "✅ File Excel dikirim ke admin.");
      await fs.unlink(filePath);
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal membuat Excel: ${err.message}`);
      console.error(err);
    }
  },

  // ================== DOWNLOAD DOCS ==================
  downloadDocs_choose: async (session, chatId, _text, waClient) => {
    const msg = `*Download Dokumentasi*\n1️⃣ Front End\n2️⃣ Back End\nBalas angka menu atau *batal* untuk keluar.`;
    session.step = "downloadDocs_send";
    await waClient.sendMessage(chatId, msg);
  },
  downloadDocs_send: async (session, chatId, text, waClient) => {
    const choice = text.trim();
    let targetDir = "";
    let filename = "";
    if (choice === "1") {
      targetDir = path.join(process.cwd(), "..", "Cicero_Web");
      filename = "frontend-docs.pdf";
    } else if (choice === "2") {
      targetDir = process.cwd();
      filename = "backend-docs.pdf";
    } else if (choice.toLowerCase() === "batal") {
      session.step = "main";
      await waClient.sendMessage(chatId, "Dibatalkan.");
      return;
    } else {
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas *1* atau *2*.");
      return;
    }
    session.step = "main";
    try {
      await fs.access(targetDir);
    } catch (_e) {
      await waClient.sendMessage(chatId, "❌ Folder tidak ditemukan.");
      return;
    }
    try {
      await waClient.sendMessage(chatId, "⏳ Menyiapkan dokumen...");
      const buffer = await buildDocsPdf(targetDir, filename);
      await sendWAFile(waClient, buffer, filename, chatId, "application/pdf");
      await waClient.sendMessage(chatId, "✅ Dokumen dikirim.");
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal membuat dokumen: ${err.message}`);
    }
  },

  // ================== EXCEPTION INFO ==================
  exceptionInfo_chooseClient: async (
    session,
    chatId,
    text,
    waClient,
    pool
  ) => {
    const rows = await query(
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
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "exceptionInfo_show";
  },
  exceptionInfo_show: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai daftar."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    let users = await userModel.getExceptionUsersByClient(client_id);
    if (!users.length) {
      await waClient.sendMessage(
        chatId,
        `Tidak ada user exception untuk *${client_id}*.`
      );
      session.step = "main";
      return;
    }
    let msg = `*Daftar User Exception*\nClient: *${client_id}*\nTotal: ${users.length}\n`;
    const byDiv = groupByDivision(users);
    const keys = sortDivisionKeys(Object.keys(byDiv));
    keys.forEach((div) => {
      msg += `\n*${div}* (${byDiv[div].length} user):\n`;
      msg += byDiv[div]
        .map((u) => `- ${formatNama(u)} (${u.user_id})`)
        .join("\n");
      msg += "\n";
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "main";
  },

  // ================== HAPUS WA USER ==================
  hapusWAUser_start: async (session, chatId, text, waClient) => {
    session.step = "hapusWAUser_nrp";
    await waClient.sendMessage(
      chatId,
      "Masukkan *user_id* / NRP/NIP yang akan dihapus WhatsApp-nya:"
    );
  },
  hapusWAUser_nrp: async (session, chatId, text, waClient) => {
    session.target_user_id = text.trim();
    session.step = "hapusWAUser_confirm";
    await waClient.sendMessage(
      chatId,
      `Konfirmasi hapus WhatsApp untuk user *${session.target_user_id}*? Balas *ya* untuk melanjutkan atau *tidak* untuk membatalkan.`
    );
  },
  hapusWAUser_confirm: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    if (text.trim().toLowerCase() !== "ya") {
      await waClient.sendMessage(chatId, "Dibatalkan.");
      session.step = "main";
      return;
    }
    try {
      await userModel.updateUserField(session.target_user_id, "whatsapp", "");
      await waClient.sendMessage(
        chatId,
        `✅ WhatsApp untuk user ${session.target_user_id} berhasil dihapus.`
      );
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal menghapus WhatsApp user: ${err.message}`
      );
    }
    session.step = "main";
  },

  // ================== HAPUS WA ADMIN ==================
  hapusWAAdmin_confirm: async (session, chatId, text, waClient) => {
    session.step = "hapusWAAdmin_execute";
    await waClient.sendMessage(
      chatId,
      "⚠️ Semua user dengan nomor WhatsApp yang sama seperti ADMIN_WHATSAPP akan dihapus field WhatsApp-nya.\nBalas *ya* untuk melanjutkan atau *tidak* untuk membatalkan."
    );
  },
  hapusWAAdmin_execute: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    if (text.trim().toLowerCase() !== "ya") {
      await waClient.sendMessage(chatId, "Dibatalkan.");
      session.step = "main";
      return;
    }
    try {
      const numbers0 = getAdminWANumbers();
      const numbers62 = numbers0.map((n) =>
        n.startsWith("0") ? "62" + n.slice(1) : n
      );
      const targets = Array.from(new Set([...numbers0, ...numbers62]));
      const updated = await userModel.clearUsersWithAdminWA(targets);
      await waClient.sendMessage(
        chatId,
        `✅ WhatsApp dikosongkan untuk ${updated.length} user.`
      );
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal menghapus WA admin: ${err.message}`
      );
    }
    session.step = "main";
  },

  // ================== ABSENSI OPERATOR DITBINMAS ==================
  absensiOprDitbinmas: async (session, chatId, _text, waClient) => {
    const msg = await absensiRegistrasiDashboardDitbinmas();
    await waClient.sendMessage(chatId, msg);
    session.step = "main";
  },


  // ================== LAINNYA ==================
  lainnya_menu: async (session, chatId, text, waClient) => {
    await waClient.sendMessage(chatId, "Fitur lain belum tersedia.");
    session.step = "main";
  },
};

export default clientRequestHandlers;
