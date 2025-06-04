// =======================
// IMPORTS & KONFIGURASI
// =======================
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import dotenv from "dotenv";
import { pool } from "../config/db.js"; // Pastikan path ini sesuai projek Anda

// Service & Utility Imports
import * as clientService from "./clientService.js";
import { migrateUsersFromFolder } from "./userMigrationService.js";
import { checkGoogleSheetCsvStatus } from "./checkGoogleSheetAccess.js";
import { importUsersFromGoogleSheet } from "./importUsersFromGoogleSheet.js";
import * as userService from "./userService.js";
import { fetchAndStoreInstaContent } from "./instaFetchService.js";

// Model Imports
import { getLikesByShortcode } from "../model/instaLikeModel.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { getUsersByClient } from "../model/userModel.js";

import { getTiktokSecUid } from "./tiktokFetchService.js";

dotenv.config();

// =======================
// HELPER FUNCTIONS
// =======================

const clientRequestSessions = {}; // { chatId: {step, data, ...} }
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 menit timeout

// Tambah di atas (global scope)
const userMenuContext = {};
const MENU_TIMEOUT = 2 * 60 * 1000; // 2 menit timeout

// --- Utility helper untuk session timeout ---
function setMenuTimeout(chatId) {
  if (userMenuContext[chatId]?.timeout) {
    clearTimeout(userMenuContext[chatId].timeout);
  }
  userMenuContext[chatId].timeout = setTimeout(() => {
    delete userMenuContext[chatId];
  }, MENU_TIMEOUT);
}

function setSession(chatId, data) {
  clientRequestSessions[chatId] = { ...data, time: Date.now() };
}
function getSession(chatId) {
  const s = clientRequestSessions[chatId];
  if (!s) return null;
  if (Date.now() - s.time > SESSION_TIMEOUT) {
    delete clientRequestSessions[chatId];
    return null;
  }
  return s;
}
function clearSession(chatId) {
  delete clientRequestSessions[chatId];
}

// Mengecek apakah nomor WhatsApp adalah admin (dari ENV)
function isAdminWhatsApp(number) {
  const adminNumbers = (process.env.ADMIN_WHATSAPP || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => (n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"));
  return adminNumbers.includes(number);
}

// Format output data client (untuk WA)
function formatClientData(obj, title = "") {
  let keysOrder = [
    "client_id",
    "nama",
    "client_type",
    "client_status",
    "client_insta",
    "client_insta_status",
    "client_tiktok",
    "client_tiktok_status",
    "client_operator",
    "client_super",
    "client_group",
    "tiktok_secUid",
  ];
  let dataText = title ? `${title}\n` : "";
  for (const key of keysOrder) {
    if (key in obj) {
      let v = obj[key];
      if (typeof v === "object" && v !== null) v = JSON.stringify(v);
      dataText += `*${key}*: ${v}\n`;
    }
  }
  Object.keys(obj).forEach((key) => {
    if (!keysOrder.includes(key)) {
      let v = obj[key];
      if (typeof v === "object" && v !== null) v = JSON.stringify(v);
      dataText += `*${key}*: ${v}\n`;
    }
  });
  return dataText;
}

// Konversi nomor ke WhatsAppID (xxxx@c.us)
function formatToWhatsAppId(nohp) {
  let number = nohp.replace(/\D/g, "");
  if (!number.startsWith("62")) number = "62" + number.replace(/^0/, "");
  return `${number}@c.us`;
}

// =======================
// INISIALISASI CLIENT WA
// =======================
const waClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true },
});

// Handle QR code (scan)
waClient.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("[WA] Scan QR dengan WhatsApp Anda!");
});

// Siap digunakan
waClient.on("ready", () => {
  console.log("[WA] WhatsApp client is ready!");
});

// Temporary in-memory, ideally simpan ke DB
const knownUserSet = new Set();

// =======================
// MESSAGE HANDLER UTAMA
// =======================
waClient.on("message", async (msg) => {
  const chatId = msg.from;
  const text = msg.body.trim();

  // === Proteksi untuk command admin only ===
  const adminCommands = [
    "addnewclient#",
    "updateclient#",
    "removeclient#",
    "clientinfo#",
    "clientrequest",
    "advancedclientrequest",
    "transferuser#",
    "sheettransfer#",
    "thisgroup#",
    "requestinsta#",
    "requesttiktok#",
    "fetchinsta#",
    "fetchtiktok#",
    "absensilikes#",
    "absensikomentar#",
    "exception#",
    "status#",
  ];
  const isAdminCommand = adminCommands.some((cmd) =>
    text.toLowerCase().startsWith(cmd)
  );
  if (isAdminCommand && !isAdminWhatsApp(chatId)) {
    await waClient.sendMessage(
      chatId,
      "❌ Anda tidak memiliki akses ke sistem ini."
    );
    return;
  }

  // --- Handler otomatis update username dari link IG/TikTok ---
  // Sesi sementara untuk update username via link (gunakan di konteks handler global)
  const updateUsernameSession = {}; // key: chatId

  // Tangkap pesan yang hanya berisi link Instagram/TikTok
  if (
    !text.includes("#") &&
    (text.match(/^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/i) ||
      text.match(/^https?:\/\/(www\.)?tiktok\.com\/@([A-Za-z0-9._]+)\/?$/i))
  ) {
    updateUsernameSession[chatId] = {
      link: text.trim(),
      step: "confirm",
    };
    await waClient.sendMessage(
      chatId,
      `Apakah Anda ingin mengupdate username akun Anda sesuai link ini?\n*${text.trim()}*\n\nBalas *ya* untuk melanjutkan atau *tidak* untuk membatalkan.`
    );
    return;
  }

  // Proses konfirmasi (step=confirm)
  if (
    updateUsernameSession[chatId] &&
    updateUsernameSession[chatId].step === "confirm"
  ) {
    const jawaban = text.trim().toLowerCase();
    if (jawaban === "tidak" || jawaban === "batal") {
      delete updateUsernameSession[chatId];
      await waClient.sendMessage(chatId, "Update username dibatalkan.");
      return;
    }
    if (jawaban !== "ya") {
      await waClient.sendMessage(
        chatId,
        "Balas *ya* untuk melanjutkan update username atau *tidak* untuk membatalkan."
      );
      return;
    }

    // Jawaban "ya", lanjut cek binding WA
    const pengirim = chatId.replace(/[^0-9]/g, "");
    let username = null;
    let field = null;
    let match = null;
    if (
      (match = updateUsernameSession[chatId].link.match(
        /^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?$/i
      ))
    ) {
      username = match[2];
      field = "insta";
    } else if (
      (match = updateUsernameSession[chatId].link.match(
        /^https?:\/\/(www\.)?tiktok\.com\/@([A-Za-z0-9._]+)\/?$/i
      ))
    ) {
      username = "@" + match[2];
      field = "tiktok";
    }

    if (!username || !field) {
      await waClient.sendMessage(
        chatId,
        "Link tidak valid atau sistem gagal membaca username."
      );
      delete updateUsernameSession[chatId];
      return;
    }

    // Cek user berdasarkan nomor WhatsApp
    const user = await userService.findUserByWA(pengirim);
    if (user) {
      // Update username
      await userService.updateUserField(user.user_id, field, username);
      await waClient.sendMessage(
        chatId,
        `✅ Username *${
          field === "insta" ? "Instagram" : "TikTok"
        }* berhasil diupdate menjadi *${username}* untuk user NRP/NIP *${
          user.user_id
        }*.`
      );
      delete updateUsernameSession[chatId];
      return;
    } else {
      // WA belum terdaftar, minta NRP
      updateUsernameSession[chatId].step = "ask_nrp";
      updateUsernameSession[chatId].username = username;
      updateUsernameSession[chatId].field = field;
      await waClient.sendMessage(
        chatId,
        "Nomor WhatsApp Anda belum terhubung ke data user manapun.\nSilakan ketik NRP/NIP Anda untuk binding akun:"
      );
      return;
    }
  }

  // Proses binding NRP (step=ask_nrp)
  if (
    updateUsernameSession[chatId] &&
    updateUsernameSession[chatId].step === "ask_nrp"
  ) {
    const nrp = text.replace(/[^0-9a-zA-Z]/g, "");
    if (!nrp) {
      await waClient.sendMessage(
        chatId,
        "NRP/NIP tidak valid. Coba lagi atau balas *batal* untuk membatalkan."
      );
      return;
    }
    const user = await userService.findUserById(nrp);
    if (!user) {
      await waClient.sendMessage(
        chatId,
        `User dengan NRP/NIP *${nrp}* tidak ditemukan. Coba lagi atau balas *batal* untuk membatalkan.`
      );
      return;
    }
    // Cek WA sudah digunakan oleh user lain belum?
    const pengirim = chatId.replace(/[^0-9]/g, "");
    const waUsed = await userService.findUserByWA(pengirim);
    if (waUsed && waUsed.user_id !== user.user_id) {
      await waClient.sendMessage(
        chatId,
        `Nomor WhatsApp ini sudah terpakai pada NRP/NIP *${waUsed.user_id}*. Hanya satu user per WA yang diizinkan.`
      );
      delete updateUsernameSession[chatId];
      return;
    }
    // Update username dan bind WA
    await userService.updateUserField(
      user.user_id,
      updateUsernameSession[chatId].field,
      updateUsernameSession[chatId].username
    );
    await userService.updateUserField(user.user_id, "whatsapp", pengirim);
    await waClient.sendMessage(
      chatId,
      `✅ Username *${
        updateUsernameSession[chatId].field === "insta" ? "Instagram" : "TikTok"
      }* berhasil diupdate menjadi *${
        updateUsernameSession[chatId].username
      }* dan nomor WhatsApp Anda telah di-bind ke user NRP/NIP *${
        user.user_id
      }*.`
    );
    delete updateUsernameSession[chatId];
    return;
  }

  // =======================
  // HANDLER PERINTAH INTERAKTIF USER REQUEST
  // =======================

  // --- Mulai menu interaktif userrequest ---
  if (text.toLowerCase() === "userrequest") {
    userMenuContext[chatId] = { step: "main" };
    setMenuTimeout(chatId);
    await waClient.sendMessage(
      chatId,
      `📝 *Menu User Cicero System*\n` +
        `Balas dengan angka pilihan:\n` +
        `1. Lihat data saya\n` +
        `2. Update data saya\n` +
        `3. Daftar perintah\n` +
        `4. Kontak operator\n\n` +
        `Ketik *batal* untuk keluar dari menu.`
    );
    return;
  }

  if (userMenuContext[chatId] && text.toLowerCase() === "batal") {
    delete userMenuContext[chatId];
    await waClient.sendMessage(chatId, "✅ Menu User ditutup. Terima kasih.");
    return;
  }

  if (userMenuContext[chatId]) {
    setMenuTimeout(chatId);
    const session = userMenuContext[chatId];
    const handler = userMenuHandlers[session.step];
    if (handler) {
      await handler(session, chatId, text, waClient, pool, userService);
    } else {
      await waClient.sendMessage(
        chatId,
        "⚠️ Sesi menu user tidak dikenal, silakan ketik *userrequest* ulang atau *batal*."
      );
      delete userMenuContext[chatId];
    }
    return;
  }

  // =======================
  // HANDLER PERINTAH ADMIN CICERO
  // =======================
  // ==== Interaktif Menu Client Request ====
  if (text.toLowerCase() === "clientrequest") {
    if (!isAdminWhatsApp(chatId)) {
      await waClient.sendMessage(
        chatId,
        "❌ Anda tidak memiliki akses ke menu ini."
      );
      return;
    }
    setSession(chatId, { step: "main" });
    await waClient.sendMessage(
      chatId,
      `🛠️ *Menu Admin Client Cicero*\n` +
        `Balas angka pilihan:\n` +
        `1. Tambah client baru\n` +
        `2. Update client\n` +
        `3. Hapus client\n` +
        `4. Info client\n` +
        `5. Transfer user dari folder\n` +
        `6. Import user dari Google Sheet\n` +
        `7. Fetch Instagram\n` +
        `8. Fetch TikTok\n` +
        `9. Rekap absensi likes IG\n` +
        `10. Rekap absensi komentar TikTok\n` +
        `11. Daftar perintah manual (advanced)\n\n` +
        `Ketik *batal* untuk keluar dari menu.`
    );
    return;
  }

  // ==== Keluar session ====
  if (getSession(chatId) && text.toLowerCase() === "batal") {
    clearSession(chatId);
    await waClient.sendMessage(chatId, "✅ Menu Admin Client ditutup.");
    return;
  }

  // ==== Handler interaktif per step ====
  const session = getSession(chatId);
  if (session) {
    setSession(chatId, session); // perpanjang waktu

    // MENU UTAMA
    if (session.step === "main") {
      switch (text) {
        case "1":
          session.step = "addClient_id";
          setSession(chatId, session);
          await waClient.sendMessage(
            chatId,
            "Masukkan *client_id* untuk client baru:"
          );
          return;
        case "2":
          session.step = "updateClient_id";
          setSession(chatId, session);
          await waClient.sendMessage(
            chatId,
            "Masukkan *client_id* yang ingin diupdate:"
          );
          return;
        case "3":
          session.step = "removeClient_id";
          setSession(chatId, session);
          await waClient.sendMessage(
            chatId,
            "Masukkan *client_id* yang ingin dihapus:"
          );
          return;
        case "4":
          session.step = "infoClient_id";
          setSession(chatId, session);
          await waClient.sendMessage(
            chatId,
            "Masukkan *client_id* yang ingin dilihat infonya:"
          );
          return;
        case "5":
          session.step = "transferUser_id";
          setSession(chatId, session);
          await waClient.sendMessage(
            chatId,
            "Masukkan *client_id* untuk transfer user:"
          );
          return;
        case "6":
          session.step = "sheetTransfer_id";
          setSession(chatId, session);
          await waClient.sendMessage(
            chatId,
            "Masukkan *client_id* untuk import user Google Sheet:"
          );
          return;
        case "7":
          session.step = "fetchInsta_id";
          setSession(chatId, session);
          await waClient.sendMessage(
            chatId,
            "Masukkan *client_id* untuk fetch Instagram:"
          );
          return;
        case "8":
          session.step = "fetchTiktok_id";
          setSession(chatId, session);
          await waClient.sendMessage(
            chatId,
            "Masukkan *client_id* untuk fetch TikTok:"
          );
          return;
        case "9":
          session.step = "absensiLikes_id";
          setSession(chatId, session);
          await waClient.sendMessage(
            chatId,
            "Masukkan *client_id* untuk rekap likes IG:"
          );
          return;
        case "10":
          session.step = "absensiKomentar_id";
          setSession(chatId, session);
          await waClient.sendMessage(
            chatId,
            "Masukkan *client_id* untuk rekap komentar TikTok:"
          );
          return;

        case "11":
          await waClient.sendMessage(
            chatId,
            "(Lihat daftar command manual seperti handler lama)"
          );
          clearSession(chatId);
          return;
        default:
          await waClient.sendMessage(
            chatId,
            "Pilihan tidak valid. Balas angka 1-11, atau *batal* untuk keluar."
          );
          return;
      }
    }

    // Tambah client
    if (session.step === "addClient_id") {
      session.newClient_id = text.trim().toUpperCase();
      session.step = "addClient_nama";
      setSession(chatId, session);
      await waClient.sendMessage(chatId, "Masukkan *nama* client baru:");
      return;
    }
    if (session.step === "addClient_nama") {
      const client_id = session.newClient_id;
      const nama = text.trim();
      try {
        const newClient = await clientService.createClient({
          client_id,
          nama,
          client_type: "",
          client_status: true,
          client_insta: "",
          client_insta_status: false,
          client_tiktok: "",
          client_tiktok_status: false,
          client_operator: "",
          client_super: "",
          client_group: "",
          tiktok_secUid: "",
        });
        await waClient.sendMessage(
          chatId,
          `✅ Client berhasil ditambah:\n${formatClientData(newClient)}`
        );
      } catch (e) {
        await waClient.sendMessage(
          chatId,
          `❌ Gagal tambah client: ${e.message}`
        );
      }
      clearSession(chatId);
      return;
    }

    // Update client
    if (session.step === "updateClient_id") {
      session.targetClient_id = text.trim().toUpperCase();
      session.step = "updateClient_field";
      setSession(chatId, session);
      await waClient.sendMessage(
        chatId,
        "Masukkan *key/field* yang ingin diupdate (misal: client_insta, client_operator, tiktok_secUid, dll):"
      );
      return;
    }
    if (session.step === "updateClient_field") {
      session.updateField = text.trim();
      session.step = "updateClient_value";
      setSession(chatId, session);
      await waClient.sendMessage(
        chatId,
        `Masukkan value baru untuk *${session.updateField}* (isi dengan true/false untuk boolean):`
      );
      return;
    }
    if (session.step === "updateClient_value") {
      try {
        const updated = await clientService.updateClient(
          session.targetClient_id,
          { [session.updateField]: text.trim() }
        );
        if (updated) {
          await waClient.sendMessage(
            chatId,
            `✅ Update berhasil:\n${formatClientData(updated)}`
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
      clearSession(chatId);
      return;
    }

    // Hapus client
    if (session.step === "removeClient_id") {
      const client_id = text.trim().toUpperCase();
      try {
        const removed = await clientService.deleteClient(client_id);
        if (removed) {
          await waClient.sendMessage(
            chatId,
            `🗑️ Client ${client_id} berhasil dihapus.\n${formatClientData(
              removed
            )}`
          );
        } else {
          await waClient.sendMessage(chatId, "❌ Client tidak ditemukan.");
        }
      } catch (e) {
        await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
      clearSession(chatId);
      return;
    }

    // Info client
    if (session.step === "infoClient_id") {
      const client_id = text.trim().toUpperCase();
      try {
        const client = await clientService.findClientById(client_id);
        if (client) {
          await waClient.sendMessage(
            chatId,
            formatClientData(client, "ℹ️ Info Client:")
          );
        } else {
          await waClient.sendMessage(chatId, "❌ Client tidak ditemukan.");
        }
      } catch (e) {
        await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
      clearSession(chatId);
      return;
    }

    // Transfer user
    if (session.step === "transferUser_id") {
      const client_id = text.trim().toUpperCase();
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
      clearSession(chatId);
      return;
    }

    // Sheet transfer
    if (session.step === "sheetTransfer_id") {
      session.sheetTransfer_client_id = text.trim().toUpperCase();
      session.step = "sheetTransfer_link";
      setSession(chatId, session);
      await waClient.sendMessage(chatId, "Masukkan link Google Sheet:");
      return;
    }
    if (session.step === "sheetTransfer_link") {
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
      clearSession(chatId);
      return;
    }

    // Fetch Instagram
    if (session.step === "fetchInsta_id") {
      const client_id = text.trim().toUpperCase();
      try {
        await fetchAndStoreInstaContent(null, waClient, chatId, client_id);
        await waClient.sendMessage(
          chatId,
          `✅ Selesai fetch Instagram untuk ${client_id}.`
        );
      } catch (e) {
        await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
      clearSession(chatId);
      return;
    }

    // Fetch TikTok
    if (session.step === "fetchTiktok_id") {
      const client_id = text.trim().toUpperCase();

      if (!client_id) {
        await waClient.sendMessage(
          chatId,
          "Format salah!\nSilakan masukkan Client ID TikTok yang benar."
        );
        return;
      }

      await waClient.sendMessage(
        chatId,
        `⏳ Memulai fetch TikTok untuk *${client_id}* ...`
      );

      // === DEBUGGING SECTION ===
      function sendDebug(msg) {
        const adminWA = (process.env.ADMIN_WHATSAPP || "")
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
          .map((n) =>
            n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"
          );
        for (const wa of adminWA)
          waClient.sendMessage(wa, "[DEBUG FETTIKTOK] " + msg).catch(() => {});
        console.log("[DEBUG FETTIKTOK] " + msg);
      }
      // === END DEBUG SECTION ===

      try {
        // === 1. Fetch TikTok via API ===
        let posts;
        try {
          const { fetchAndStoreTiktokContent } = await import(
            "../service/tiktokFetchService.js"
          );
          if (!fetchAndStoreTiktokContent)
            throw new Error("fetchAndStoreTiktokContent() not exported!");
          posts = await fetchAndStoreTiktokContent(client_id);
          sendDebug(
            `API TikTok fetchAndStoreTiktokContent OK, hasil: ${
              Array.isArray(posts) ? posts.length : "null"
            }`
          );
        } catch (apiErr) {
          sendDebug(`GAGAL API TikTok: ${apiErr.stack || apiErr.message}`);
          posts = undefined;
        }

        // === 2. Fallback DB jika API gagal/kosong ===
        if (!posts || posts.length === 0) {
          try {
            const { getPostsTodayByClient } = await import(
              "../model/tiktokPostModel.js"
            );
            posts = await getPostsTodayByClient(client_id);
            sendDebug(
              `Fallback getPostsTodayByClient OK, hasil: ${
                Array.isArray(posts) ? posts.length : "null"
              }`
            );
            if (posts && posts.length > 0) {
              await waClient.sendMessage(
                chatId,
                `⚠️ Tidak ada post TikTok hari ini dari API, menggunakan data dari database...`
              );
            }
          } catch (dbErr) {
            sendDebug(`GAGAL Query DB TikTok: ${dbErr.stack || dbErr.message}`);
            posts = undefined;
          }
        }

        // === 3. Jika tetap kosong, kirim notif tidak ada post ===
        if (!posts || posts.length === 0) {
          sendDebug(
            `Tidak ada post ditemukan di API maupun database untuk client_id=${client_id}`
          );
          await waClient.sendMessage(
            chatId,
            `❌ Tidak ada post TikTok hari ini untuk client *${client_id}*`
          );
          clearSession(chatId);
          return;
        }

        // === 4. Ambil username TikTok untuk link ===
        let username = "-";
        try {
          const { findById } = await import("../model/clientModel.js");
          const client = await findById(client_id);
          username = client?.client_tiktok || "-";
          if (username.startsWith("@")) username = username.slice(1);
          sendDebug(`Client TikTok username: ${username}`);
        } catch (userErr) {
          sendDebug(
            `Gagal ambil username TikTok dari DB: ${
              userErr.stack || userErr.message
            }`
          );
        }

        // === 5. Format laporan rekap post TikTok hari ini ===
        let msg = `*Rekap Post TikTok Hari Ini*\nClient: *${client_id}*\n\n`;
        msg += `Jumlah post: *${posts.length}*\n\n`;
        posts.forEach((item, i) => {
          const desc = item.desc || item.caption || "-";
          let create_time =
            item.create_time || item.created_at || item.createTime;
          let created = "-";
          if (typeof create_time === "number") {
            if (create_time > 2000000000) {
              created = new Date(create_time).toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
              });
            } else {
              created = new Date(create_time * 1000).toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
              });
            }
          } else if (typeof create_time === "string") {
            created = new Date(create_time).toLocaleString("id-ID", {
              timeZone: "Asia/Jakarta",
            });
          } else if (create_time instanceof Date) {
            created = create_time.toLocaleString("id-ID", {
              timeZone: "Asia/Jakarta",
            });
          }
          const video_id = item.video_id || item.id;
          msg += `#${i + 1} Video ID: ${video_id}\n`;
          msg += `   Deskripsi: ${desc.slice(0, 50)}\n`;
          msg += `   Tanggal: ${created}\n`;
          msg += `   Like: ${
            item.digg_count ?? item.like_count ?? 0
          } | Komentar: ${item.comment_count ?? 0}\n`;
          msg += `   Link: https://www.tiktok.com/@${username}/video/${video_id}\n\n`;
        });

        await waClient.sendMessage(chatId, msg.trim());
        sendDebug("Laporan berhasil dikirim ke user.");
      } catch (err) {
        sendDebug("ERROR CATCH FINAL: " + (err.stack || err.message));
        await waClient.sendMessage(chatId, `❌ ERROR: ${err.message}`);
      }
      clearSession(chatId);
      return;
    }

    // Absensi likes IG
    if (session.step === "absensiLikes_id") {
      session.absensiLikes_client_id = text.trim().toUpperCase();
      session.step = "absensiLikes_mode";
      setSession(chatId, session);
      await waClient.sendMessage(
        chatId,
        "Pilih mode rekap likes IG:\n" +
          "1. Akumulasi - Sudah\n" +
          "2. Akumulasi - Belum\n" +
          "3. Per Konten - Sudah\n" +
          "4. Per Konten - Belum\n" +
          "5. Per Konten - Semua\n\n" +
          "Balas dengan angka (1-5):"
      );
      return;
    }
    if (session.step === "absensiLikes_mode") {
      let filter1 = "";
      let filter2 = "";
      switch (text.trim()) {
        case "1":
          filter1 = "akumulasi";
          filter2 = "sudah";
          break;
        case "2":
          filter1 = "akumulasi";
          filter2 = "belum";
          break;
        case "3":
          filter1 = "sudah";
          break;
        case "4":
          filter1 = "belum";
          break;
        case "5":
          filter1 = "";
          break;
        default:
          await waClient.sendMessage(
            chatId,
            "Pilihan tidak valid. Balas dengan angka 1-5:"
          );
          return;
      }
      const client_id = session.absensiLikes_client_id;
      clearSession(chatId); // clear agar tidak bentrok

      // Panggil logika absensilikes yang sudah ada, modifikasi sedikit
      await waClient.sendMessage(
        chatId,
        "⏳ Memproses rekap absensi likes IG..."
      );

      // ... LOGIKA ABSENSILIKES di sini ...
      // Bisa refactor kode absensilikes#... menjadi fungsi terpisah:
      await handleAbsensiLikes(waClient, chatId, client_id, filter1, filter2);
      return;
    }

    // Absensi komentar TikTok
    if (session.step === "absensiKomentar_id") {
      session.absensiKomentar_client_id = text.trim().toUpperCase();
      session.step = "absensiKomentar_mode";
      setSession(chatId, session);
      await waClient.sendMessage(
        chatId,
        "Pilih mode rekap komentar TikTok:\n" +
          "1. Akumulasi - Sudah\n" +
          "2. Akumulasi - Belum\n" +
          "3. Per Konten - Sudah\n" +
          "4. Per Konten - Belum\n" +
          "5. Per Konten - Semua\n\n" +
          "Balas dengan angka (1-5):"
      );
      return;
    }
    if (session.step === "absensiKomentar_mode") {
      let filter1 = "";
      let filter2 = "";
      switch (text.trim()) {
        case "1":
          filter1 = "akumulasi";
          filter2 = "sudah";
          break;
        case "2":
          filter1 = "akumulasi";
          filter2 = "belum";
          break;
        case "3":
          filter1 = "sudah";
          break;
        case "4":
          filter1 = "belum";
          break;
        case "5":
          filter1 = "";
          break;
        default:
          await waClient.sendMessage(
            chatId,
            "Pilihan tidak valid. Balas dengan angka 1-5:"
          );
          return;
      }
      const client_id = session.absensiKomentar_client_id;
      clearSession(chatId); // clear agar tidak bentrok

      await waClient.sendMessage(
        chatId,
        "⏳ Memproses rekap absensi komentar TikTok..."
      );
      await handleAbsensiKomentar(
        waClient,
        chatId,
        client_id,
        filter1,
        filter2
      );
      return;
    }
  }

  // =======================
  // MANUAL COMMANDS HANDLER
  // =======================

  // =======================
  // === IG: ABSENSI LIKES
  // =======================
  if (text.toLowerCase().startsWith("absensilikes#")) {
    const parts = text.split("#");
    if (parts.length < 2) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nabsensilikes#clientid#[sudah|belum|akumulasi#sudah|akumulasi#belum]"
      );
      return;
    }
    const client_id = (parts[1] || "").trim();
    const filter1 = (parts[2] || "").toLowerCase();
    const filter2 = (parts[3] || "").toLowerCase();

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

    // 1. Fetch konten & likes IG terbaru (always update before check)
    await waClient.sendMessage(
      chatId,
      "⏳ Memperbarui konten & likes Instagram..."
    );
    try {
      await fetchAndStoreInstaContent(null); // null = pakai default keys
    } catch (e) {
      await waClient.sendMessage(
        chatId,
        `⚠️ Gagal update konten IG: ${e.message}\nAbsensi tetap dilanjutkan dengan data terakhir di database.`
      );
    }

    // 2. Siapkan data dasar rekap
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

    // 3. Ambil user dan list konten IG hari ini
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
      // Hitung akumulasi likes untuk seluruh user
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
          sudah.push(u); // Selalu masuk sudah, apapun kondisinya
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
        const sudahDiv = groupByDivision(sudah);
        sortDivisionKeys(Object.keys(sudahDiv)).forEach((div) => {
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
          sudah.push(u); // Selalu masuk sudah, apapun kondisinya
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
                  `- ${formatNama(u)} : ${
                    u.insta || "belum mengisi data insta"
                  }${!u.insta ? " (belum mengisi data insta)" : ""}`
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
        continue; // lanjut ke konten berikutnya
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
                    u.insta || "belum mengisi data insta"
                  }${!u.insta ? " (belum mengisi data insta)" : ""}`
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
    return;
  }

  // =======================
  // === TIKTOK: ABSENSI KOMENTAR
  // =======================
  if (text.toLowerCase().startsWith("absensikomentar#")) {
    const parts = text.split("#");
    if (parts.length < 2) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nabsensikomentar#clientid#[sudah|belum|akumulasi#sudah|akumulasi#belum]"
      );
      return;
    }
    const client_id = (parts[1] || "").trim();
    const filter1 = (parts[2] || "").toLowerCase();
    const filter2 = (parts[3] || "").toLowerCase();

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

    // Ambil user, post TikTok, dan client_tiktok dari database
    const { getUsersByClient } = await import("../model/userModel.js");
    const { getPostsTodayByClient } = await import(
      "../model/tiktokPostModel.js"
    );
    const users = await getUsersByClient(client_id);
    const posts = await getPostsTodayByClient(client_id);

    let client_tiktok = "-";
    try {
      const { pool } = await import("../config/db.js");
      const q =
        "SELECT client_tiktok FROM clients WHERE client_id = $1 LIMIT 1";
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

    // DEBUG LOG pengambilan data post dari DB
    let debugMsg = `[DEBUG] [absensikomentar] Hasil query getPostsTodayByClient untuk client_id=${client_id}:\n`;
    if (posts && posts.length > 0) {
      posts.forEach((p, i) => {
        debugMsg += `[DEBUG]   #${i + 1} video_id=${
          p.video_id || p.id
        } | created_at=${p.created_at || p.create_time}\n`;
      });
    } else {
      debugMsg += `[DEBUG]   Tidak ada data post TikTok ditemukan di database untuk client_id=${client_id}\n`;
    }
    console.log(debugMsg);

    // Kirim debug ke ADMIN_WHATSAPP
    const adminWA = (process.env.ADMIN_WHATSAPP || "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => (n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"));
    for (const wa of adminWA) {
      waClient.sendMessage(wa, debugMsg).catch(() => {});
    }

    if (!posts || posts.length === 0) {
      await waClient.sendMessage(
        chatId,
        headerLaporan +
          `Tidak ada post TikTok untuk *Polres*: *${client_id}* hari ini.\n${hari}, ${tanggal}\nJam: ${jam}`
      );
      return;
    }

    // FETCH & STORE KOMENTAR SETIAP POST (PASTI FRESH DARI API)
    const { fetchAndStoreTiktokComments } = await import(
      "../service/tiktokCommentService.js"
    );
    for (const [i, post] of posts.entries()) {
      const video_id = post.video_id || post.id;
      let msgStart = `[DEBUG][absensikomentar] Mulai fetch komentar video_id=${video_id} (${
        i + 1
      }/${posts.length})`;
      console.log(msgStart);
      for (const wa of adminWA)
        waClient.sendMessage(wa, msgStart).catch(() => {});
      try {
        const allComments = await fetchAndStoreTiktokComments(video_id);
        let msgOk = `[DEBUG][absensikomentar] Sukses fetch & simpan ${allComments.length} komentar video_id=${video_id}`;
        console.log(msgOk);
        for (const wa of adminWA)
          waClient.sendMessage(wa, msgOk).catch(() => {});
      } catch (err) {
        let msgErr = `[ERROR][absensikomentar] Gagal fetch komentar video_id=${video_id}: ${err.message}`;
        console.log(msgErr);
        for (const wa of adminWA)
          waClient.sendMessage(wa, msgErr).catch(() => {});
      }
    }

    // Lanjutkan proses absensi komentar (dari DB, hasil update tadi)
    const { getCommentsByVideoId } = await import(
      "../model/tiktokCommentModel.js"
    );
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
          const tiktokUsername = (u.tiktok || "")
            .replace(/^@/, "")
            .toLowerCase();
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
          sudah.push(u); // Selalu dianggap sudah jika exception
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

      // Jika ada exception yang masih masuk belum (karena error data), keluarkan!
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
          sudah.push(u); // Selalu dianggap sudah jika exception
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

      // Filter, pastikan tidak ada exception di "belum"
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
    return;
  }

  // =========================
  // === FETCH INSTAGRAM (ADMIN)
  // =========================
  if (text.startsWith("fetchinsta#")) {
    const keysString = text.replace("fetchinsta#", "").trim();
    let keys = keysString
      ? keysString.split(",").map((k) => k.trim())
      : ["shortcode", "caption", "like_count", "timestamp"];
    try {
      await fetchAndStoreInstaContent(keys, waClient, chatId);
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal fetch/simpan: ${err.message}`
      );
    }
    return;
  }

  // =========================
  // === FETCH TIKTOK MANUAL (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("fetchtiktok#")) {
    const [, raw_id] = text.split("#");
    const client_id = (raw_id || "").trim().toUpperCase();

    if (!client_id) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: fetchtiktok#clientid"
      );
      return;
    }

    await waClient.sendMessage(
      chatId,
      `⏳ Memulai fetch TikTok untuk *${client_id}* ...`
    );

    // === DEBUGGING SECTION ===
    function sendDebug(msg) {
      const adminWA = (process.env.ADMIN_WHATSAPP || "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => (n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"));
      for (const wa of adminWA)
        waClient.sendMessage(wa, "[DEBUG FETTIKTOK] " + msg).catch(() => {});
      console.log("[DEBUG FETTIKTOK] " + msg);
    }
    // === END DEBUG SECTION ===

    try {
      // === 1. Fetch post TikTok via API ===
      let posts;
      try {
        const { fetchAndStoreTiktokContent } = await import(
          "../service/tiktokFetchService.js"
        );
        if (!fetchAndStoreTiktokContent)
          throw new Error("fetchAndStoreTiktokContent() not exported!");
        posts = await fetchAndStoreTiktokContent(client_id);
        sendDebug(
          `API TikTok fetchAndStoreTiktokContent OK, hasil: ${
            Array.isArray(posts) ? posts.length : "null"
          }`
        );
      } catch (apiErr) {
        sendDebug(`GAGAL API TikTok: ${apiErr.stack || apiErr.message}`);
        posts = undefined;
      }

      // === 2. Fallback DB jika API gagal/kosong ===
      if (!posts || posts.length === 0) {
        try {
          const { getPostsTodayByClient } = await import(
            "../model/tiktokPostModel.js"
          );
          posts = await getPostsTodayByClient(client_id);
          sendDebug(
            `Fallback getPostsTodayByClient OK, hasil: ${
              Array.isArray(posts) ? posts.length : "null"
            }`
          );
          if (posts && posts.length > 0) {
            await waClient.sendMessage(
              chatId,
              `⚠️ Tidak ada post TikTok hari ini dari API, menggunakan data dari database...`
            );
          }
        } catch (dbErr) {
          sendDebug(`GAGAL Query DB TikTok: ${dbErr.stack || dbErr.message}`);
          posts = undefined;
        }
      }

      // === 3. Jika tetap kosong, kirim notif tidak ada post ===
      if (!posts || posts.length === 0) {
        sendDebug(
          `Tidak ada post ditemukan di API maupun database untuk client_id=${client_id}`
        );
        await waClient.sendMessage(
          chatId,
          `❌ Tidak ada post TikTok hari ini untuk client *${client_id}*`
        );
        return;
      }

      // === 4. Ambil username TikTok untuk link ===
      let username = "-";
      try {
        const { findById } = await import("../model/clientModel.js");
        const client = await findById(client_id);
        username = client?.client_tiktok || "-";
        if (username.startsWith("@")) username = username.slice(1);
        sendDebug(`Client TikTok username: ${username}`);
      } catch (userErr) {
        sendDebug(
          `Gagal ambil username TikTok dari DB: ${
            userErr.stack || userErr.message
          }`
        );
      }

      // === 5. Format laporan rekap post TikTok hari ini ===
      let msg = `*Rekap Post TikTok Hari Ini*\nClient: *${client_id}*\n\n`;
      msg += `Jumlah post: *${posts.length}*\n\n`;
      posts.forEach((item, i) => {
        const desc = item.desc || item.caption || "-";
        let create_time =
          item.create_time || item.created_at || item.createTime;
        let created = "-";
        if (typeof create_time === "number") {
          if (create_time > 2000000000) {
            created = new Date(create_time).toLocaleString("id-ID", {
              timeZone: "Asia/Jakarta",
            });
          } else {
            created = new Date(create_time * 1000).toLocaleString("id-ID", {
              timeZone: "Asia/Jakarta",
            });
          }
        } else if (typeof create_time === "string") {
          created = new Date(create_time).toLocaleString("id-ID", {
            timeZone: "Asia/Jakarta",
          });
        } else if (create_time instanceof Date) {
          created = create_time.toLocaleString("id-ID", {
            timeZone: "Asia/Jakarta",
          });
        }
        const video_id = item.video_id || item.id;
        msg += `#${i + 1} Video ID: ${video_id}\n`;
        msg += `   Deskripsi: ${desc.slice(0, 50)}\n`;
        msg += `   Tanggal: ${created}\n`;
        msg += `   Like: ${
          item.digg_count ?? item.like_count ?? 0
        } | Komentar: ${item.comment_count ?? 0}\n`;
        msg += `   Link: https://www.tiktok.com/@${username}/video/${video_id}\n\n`;
      });

      await waClient.sendMessage(chatId, msg.trim());
      sendDebug("Laporan berhasil dikirim ke user.");
    } catch (err) {
      sendDebug("ERROR CATCH FINAL: " + (err.stack || err.message));
      await waClient.sendMessage(chatId, `❌ ERROR: ${err.message}`);
    }
    return;
  }

  // =========================
  // === REQUEST TIKTOK/INSTA STATUS (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("requesttiktok#")) {
    const [, client_id, status] = text.split("#");
    if (!client_id || (status !== "sudah" && status !== "belum")) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: requesttiktok#clientid#sudah atau requesttiktok#clientid#belum"
      );
      return;
    }

    if (status === "sudah") {
      try {
        const users = await userService.getTiktokFilledUsersByClient(client_id);
        if (!users || users.length === 0) {
          await waClient.sendMessage(
            chatId,
            `Tidak ada user dari client *${client_id}* yang sudah mengisi data TikTok.`
          );
          return;
        }
        const perDivisi = {};
        users.forEach((u) => {
          if (!perDivisi[u.divisi]) perDivisi[u.divisi] = [];
          perDivisi[u.divisi].push(u);
        });
        let reply = `📋 *Rekap User yang sudah mengisi TikTok*\n*Client*: ${client_id}\n`;
        Object.entries(perDivisi).forEach(([divisi, list]) => {
          reply += `\n*${divisi}* (${list.length} user):\n`;
          list.forEach((u) => {
            reply += `- ${u.title ? u.title + " " : ""}${u.nama} : ${
              u.tiktok
            }\n`;
          });
        });
        reply += `\nTotal user: *${users.length}*`;
        await waClient.sendMessage(chatId, reply);
      } catch (err) {
        await waClient.sendMessage(
          chatId,
          `❌ Gagal mengambil data: ${err.message}`
        );
      }
      return;
    }

    if (status === "belum") {
      try {
        const users = await userService.getTiktokEmptyUsersByClient(client_id);
        if (!users || users.length === 0) {
          await waClient.sendMessage(
            chatId,
            `Semua user dari client *${client_id}* sudah mengisi data TikTok!`
          );
          return;
        }
        const perDivisi = {};
        users.forEach((u) => {
          if (!perDivisi[u.divisi]) perDivisi[u.divisi] = [];
          perDivisi[u.divisi].push(u);
        });
        let reply = `📋 *Rekap User yang BELUM mengisi TikTok*\n*Client*: ${client_id}\n`;
        Object.entries(perDivisi).forEach(([divisi, list]) => {
          reply += `\n*${divisi}* (${list.length} user):\n`;
          list.forEach((u) => {
            reply += `- ${u.title ? u.title + " " : ""}${u.nama}\n`;
          });
        });
        reply += `\nTotal user: *${users.length}*`;
        await waClient.sendMessage(chatId, reply);
      } catch (err) {
        await waClient.sendMessage(
          chatId,
          `❌ Gagal mengambil data: ${err.message}`
        );
      }
      return;
    }
  }

  if (text.toLowerCase().startsWith("requestinsta#")) {
    const [, client_id, status] = text.split("#");
    if (!client_id || (status !== "sudah" && status !== "belum")) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: requestinsta#clientid#sudah atau requestinsta#clientid#belum"
      );
      return;
    }
    if (status === "belum") {
      try {
        const users = await userService.getInstaEmptyUsersByClient(client_id);
        if (!users || users.length === 0) {
          await waClient.sendMessage(
            chatId,
            `Semua user dari client *${client_id}* sudah mengisi data Instagram!`
          );
          return;
        }
        const perDivisi = {};
        users.forEach((u) => {
          if (!perDivisi[u.divisi]) perDivisi[u.divisi] = [];
          perDivisi[u.divisi].push(u);
        });
        let reply = `📋 *Rekap User yang BELUM mengisi Instagram*\n*Client*: ${client_id}\n`;
        Object.entries(perDivisi).forEach(([divisi, list]) => {
          reply += `\n*${divisi}* (${list.length} user):\n`;
          list.forEach((u) => {
            reply += `- ${u.title ? u.title + " " : ""}${u.nama}\n`;
          });
        });
        reply += `\nTotal user: *${users.length}*`;
        await waClient.sendMessage(chatId, reply);
      } catch (err) {
        await waClient.sendMessage(
          chatId,
          `❌ Gagal mengambil data: ${err.message}`
        );
      }
      return;
    }
    if (status === "sudah") {
      try {
        const users = await userService.getInstaFilledUsersByClient(client_id);
        if (!users || users.length === 0) {
          await waClient.sendMessage(
            chatId,
            `Tidak ada user dari client *${client_id}* yang sudah mengisi data Instagram.`
          );
          return;
        }
        const perDivisi = {};
        users.forEach((u) => {
          if (!perDivisi[u.divisi]) perDivisi[u.divisi] = [];
          perDivisi[u.divisi].push(u);
        });
        let reply = `📋 *Rekap User yang sudah mengisi Instagram*\n*Client*: ${client_id}\n`;
        Object.entries(perDivisi).forEach(([divisi, list]) => {
          reply += `\n*${divisi}* (${list.length} user):\n`;
          list.forEach((u) => {
            reply += `- ${u.title ? u.title + " " : ""}${u.nama} : ${
              u.insta
            }\n`;
          });
        });
        reply += `\nTotal user: *${users.length}*`;
        await waClient.sendMessage(chatId, reply);
      } catch (err) {
        await waClient.sendMessage(
          chatId,
          `❌ Gagal mengambil data: ${err.message}`
        );
      }
      return;
    }
  }

  // =========================
  // === MIGRASI DARI GOOGLE SHEET (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("sheettransfer#")) {
    const [, client_id, ...linkParts] = text.split("#");
    const sheetUrl = linkParts.join("#").trim();
    if (!client_id || !sheetUrl) {
      await waClient.sendMessage(
        chatId,
        "Format: sheettransfer#clientid#link_google_sheet"
      );
      return;
    }
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
          r.error ? " (" + r.error + ")" : ""
        }\n`;
      });
      await waClient.sendMessage(chatId, report);
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal import: ${err.message}`);
    }
    return;
  }

  // =========================
  // === UPDATE client_group dari WhatsApp GROUP (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("thisgroup#")) {
    // Hanya bisa digunakan dalam grup WhatsApp
    if (!msg.from.endsWith("@g.us")) {
      await waClient.sendMessage(
        chatId,
        "❌ Perintah ini hanya bisa digunakan di dalam group WhatsApp!"
      );
      return;
    }
    const [, client_id] = text.split("#");
    if (!client_id) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: thisgroup#ClientID"
      );
      return;
    }
    // Ambil WhatsApp Group ID dari msg.from
    const groupId = msg.from;
    try {
      // Update client_group di database
      const updated = await clientService.updateClient(client_id, {
        client_group: groupId,
      });
      if (updated) {
        let groupName = "";
        try {
          const groupData = await waClient.getChatById(groupId);
          groupName = groupData.name ? `\nNama Group: *${groupData.name}*` : "";
        } catch (e) {}
        let dataText = `✅ Group ID berhasil disimpan untuk *${client_id}*:\n*${groupId}*${groupName}`;
        await waClient.sendMessage(chatId, dataText);
        if (updated.client_operator && updated.client_operator.length >= 8) {
          const operatorId = formatToWhatsAppId(updated.client_operator);
          if (operatorId !== chatId) {
            await waClient.sendMessage(
              operatorId,
              `[Notifikasi]: Client group *${client_id}* diupdate ke group ID: ${groupId}`
            );
          }
        }
      } else {
        await waClient.sendMessage(
          chatId,
          `❌ Client dengan ID ${client_id} tidak ditemukan!`
        );
      }
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal update client_group: ${err.message}`
      );
    }
    return;
  }

  // =========================
  // === ADD NEW CLIENT (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("addnewclient#")) {
    const [cmd, client_id, nama] = text.split("#");
    if (!client_id || !nama) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: addnewclient#clientid#clientname"
      );
      return;
    }
    try {
      const newClient = await clientService.createClient({
        client_id,
        nama,
        client_type: "",
        client_status: true,
        client_insta: "",
        client_insta_status: false,
        client_tiktok: "",
        client_tiktok_status: false,
        client_operator: "",
        client_super: "", // <== pastikan support field ini!
        client_group: "",
        tiktok_secUid: "",
      });

      let dataText = formatClientData(
        newClient,
        `✅ Data Client *${newClient.client_id}* berhasil ditambah:`
      );
      await waClient.sendMessage(chatId, dataText);

      if (newClient.client_operator && newClient.client_operator.length >= 8) {
        const operatorId = formatToWhatsAppId(newClient.client_operator);
        if (operatorId !== chatId) {
          await waClient.sendMessage(operatorId, `[Notifikasi]:\n${dataText}`);
        }
      }
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal tambah client: ${err.message}`
      );
    }
    return;
  }

  // =========================
  // === UPDATE CLIENT (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("updateclient#")) {
    const parts = text.split("#");

    // === OTOMATIS UPDATE tiktok_secUid ===
    if (parts.length === 3 && parts[2] === "tiktok_secUid") {
      const [, client_id, key] = parts;
      try {
        const client = await clientService.findClientById(client_id);
        if (!client) {
          await waClient.sendMessage(
            chatId,
            `❌ Client dengan ID ${client_id} tidak ditemukan!`
          );
          return;
        }
        let username = client.client_tiktok || "";
        if (!username) {
          await waClient.sendMessage(
            chatId,
            `❌ Username TikTok belum diisi pada client dengan ID ${client_id}.`
          );
          return;
        }
        const secUid = await getTiktokSecUid(username);
        const updated = await clientService.updateClient(client_id, {
          tiktok_secUid: secUid,
        });
        if (updated) {
          let dataText = formatClientData(
            updated,
            `✅ tiktok_secUid untuk client *${client_id}* berhasil diupdate dari username *@${username}*:\n\n*secUid*: ${secUid}\n\n*Data Terbaru:*`
          );
          await waClient.sendMessage(chatId, dataText);
          if (updated.client_operator && updated.client_operator.length >= 8) {
            const operatorId = formatToWhatsAppId(updated.client_operator);
            if (operatorId !== chatId) {
              await waClient.sendMessage(
                operatorId,
                `[Notifikasi]:\n${dataText}`
              );
            }
          }
        } else {
          await waClient.sendMessage(
            chatId,
            `❌ Gagal update secUid ke client.`
          );
        }
      } catch (err) {
        await waClient.sendMessage(chatId, `❌ Gagal proses: ${err.message}`);
      }
      return;
    }

    // === UPDATE FIELD BIASA ===
    if (parts.length >= 4) {
      const [, client_id, key, ...valueParts] = parts;
      const value = valueParts.join("#");
      try {
        const updateObj = {};
        if (
          [
            "client_status",
            "client_insta_status",
            "client_tiktok_status",
          ].includes(key)
        ) {
          updateObj[key] = value === "true";
        } else if (key === "client_tiktok" || key === "client_insta") {
          updateObj[key] = value; // Simpan username string
        } else {
          updateObj[key] = value;
        }
        const updated = await clientService.updateClient(client_id, updateObj);

        if (updated) {
          let dataText = formatClientData(
            updated,
            `✅ Data Client *${client_id}* berhasil diupdate:`
          );
          await waClient.sendMessage(chatId, dataText);

          if (updated.client_operator && updated.client_operator.length >= 8) {
            const operatorId = formatToWhatsAppId(updated.client_operator);
            if (operatorId !== chatId) {
              await waClient.sendMessage(
                operatorId,
                `[Notifikasi]:\n${dataText}`
              );
            }
          }
        } else {
          await waClient.sendMessage(
            chatId,
            `❌ Client dengan ID ${client_id} tidak ditemukan!`
          );
        }
      } catch (err) {
        await waClient.sendMessage(
          chatId,
          `❌ Gagal update client: ${err.message}`
        );
      }
      return;
    }

    // FORMAT SALAH
    await waClient.sendMessage(
      chatId,
      "Format salah!\n" +
        "updateclient#clientid#key#value\n" +
        "atau updateclient#clientid#tiktok_secUid (untuk update secUid otomatis dari username TikTok)"
    );
    return;
  }

  // =========================
  // === GET CLIENT INFO (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("clientinfo#")) {
    const [, client_id] = text.split("#");
    if (!client_id) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: clientinfo#clientid"
      );
      return;
    }
    try {
      const client = await clientService.findClientById(client_id);
      if (client) {
        let dataText = formatClientData(
          client,
          `ℹ️ Info Data Client *${client_id}*:\n`
        );
        await waClient.sendMessage(chatId, dataText);

        if (client.client_operator && client.client_operator.length >= 8) {
          const operatorId = formatToWhatsAppId(client.client_operator);
          if (operatorId !== chatId) {
            await waClient.sendMessage(
              operatorId,
              `[Notifikasi Client Info]:\n${dataText}`
            );
          }
        }
      } else {
        await waClient.sendMessage(
          chatId,
          `❌ Client dengan ID ${client_id} tidak ditemukan!`
        );
      }
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal mengambil data client: ${err.message}`
      );
    }
    return;
  }

  // =========================
  // === REMOVE CLIENT (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("removeclient#")) {
    const [, client_id] = text.split("#");
    if (!client_id) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: removeclient#clientid"
      );
      return;
    }
    try {
      const removed = await clientService.deleteClient(client_id);
      if (removed) {
        let dataText = formatClientData(
          removed,
          `🗑️ Client *${client_id}* berhasil dihapus!\nData sebelumnya:\n`
        );
        await waClient.sendMessage(chatId, dataText);

        if (removed.client_operator && removed.client_operator.length >= 8) {
          const operatorId = formatToWhatsAppId(removed.client_operator);
          if (operatorId !== chatId) {
            await waClient.sendMessage(
              operatorId,
              `[Notifikasi]:\n${dataText}`
            );
          }
        }
      } else {
        await waClient.sendMessage(
          chatId,
          `❌ Client dengan ID ${client_id} tidak ditemukan!`
        );
      }
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal hapus client: ${err.message}`
      );
    }
    return;
  }

  // =========================
  // === MIGRASI USER DARI FOLDER (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("transferuser#")) {
    const [, client_id] = text.split("#");
    if (!client_id) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: transferuser#clientid"
      );
      return;
    }
    await waClient.sendMessage(
      chatId,
      `⏳ Migrasi user dari user_data/${client_id}/ ...`
    );
    try {
      // Panggil migrasi, tunggu SEMUA file selesai diproses (success/gagal)
      const result = await migrateUsersFromFolder(client_id);
      let report = `*Hasil transfer user dari client ${client_id}:*\n`;
      result.forEach((r) => {
        report += `- ${r.file}: ${r.status}${
          r.error ? " (" + r.error + ")" : ""
        }\n`;
      });

      // Optional: Notifikasi jika semua sukses
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
    return;
  }

  // =========================
  // === MENU COMMANDS (CLIENT/USER)
  // =========================
  if (text.toLowerCase() === "advancedlientrequest") {
    if (!isAdminWhatsApp(chatId)) {
      await waClient.sendMessage(
        chatId,
        "❌ Anda tidak memiliki akses ke menu ini."
      );
      return;
    }

    const updateKeys = [
      "nama",
      "client_type",
      "client_status",
      "client_insta",
      "client_insta_status",
      "client_tiktok",
      "client_tiktok_status",
      "client_operator",
      "client_super",
      "client_group",
      "tiktok_secUid",
    ];

    const menu = `
📝 *Client Request Commands (KHUSUS ADMIN)*

1. *addnewclient#clientid#clientname*
2. *updateclient#clientid#key#value*
3. *removeclient#clientid*
4. *clientinfo#clientid*
5. *clientrequest*
6. *transferuser#clientid*
7. *sheettransfer#clientid#link_google_sheet*
8. *fetchinsta#keys*
9. *fetchtiktok#clientid*
10. *requestinsta#clientid#[sudah|belum]*
11. *requesttiktok#clientid#[sudah|belum]*
12. *thisgroup#clientid*
13. *exception#user_id#true/false*
14. *status#user_id#true/false*
15. *absensilikes#clientid#[opsi]*
    - Rekap absensi likes Instagram harian.
16. *absensikomentar#clientid#[opsi]*
    - Rekap absensi komentar TikTok harian.

*Key yang dapat digunakan pada updateclient#:*
${updateKeys.map((k) => `- *${k}*`).join("\n")}

Contoh update:
updateclient#BOJONEGORO#client_status#true
updateclient#BOJONEGORO#client_insta_status#false
updateclient#BOJONEGORO#client_operator#628123456789
updateclient#BOJONEGORO#client_super#6281234567890
updateclient#BOJONEGORO#client_tiktok#bjn_tiktok
updateclient#BOJONEGORO#tiktok_secUid

_Catatan: Untuk key boolean gunakan true/false, untuk username TikTok dan Instagram cukup string._
  `;
    await waClient.sendMessage(chatId, menu);
    return;
  }

  // =========================
  // === UPDATE DATA USER (USER)
  // =========================
  if (text.toLowerCase().startsWith("updateuser#")) {
    const parts = text.split("#");
    if (parts.length !== 4) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: updateuser#user_id#field#value"
      );
      return;
    }
    const [, user_id, field, valueRaw] = parts;
    const allowedFields = [
      "insta",
      "tiktok",
      "whatsapp",
      "exception",
      "status",
      "nama",
      "title",
      "divisi",
      "jabatan",
    ];
    if (!allowedFields.includes(field)) {
      throw new Error(
        "Hanya field tertentu yang bisa diupdate: " + allowedFields.join(", ")
      );
    }

    let fieldNorm = field.toLowerCase();
    // Normalisasi: 'pangkat' -> 'title', 'satfung' -> 'divisi'
    if (fieldNorm === "pangkat") fieldNorm = "title";
    if (fieldNorm === "satfung") fieldNorm = "divisi";

    if (!allowedFields.includes(fieldNorm)) {
      await waClient.sendMessage(
        chatId,
        "❌ Field hanya bisa: nama, pangkat, satfung, jabatan, insta, tiktok, whatsapp"
      );
      return;
    }
    // Cek user
    const user = await userService.findUserById(user_id);
    if (!user) {
      await waClient.sendMessage(
        chatId,
        `❌ User dengan NRP/NIP ${user_id} tidak ditemukan`
      );
      return;
    }
    // Cek nomor WA: binding jika masih null, kalau sudah harus sama dengan pengirim
    const pengirim = chatId.replace(/[^0-9]/g, "");
    if (!user.whatsapp || user.whatsapp === "") {
      await userService.updateUserField(user_id, "whatsapp", pengirim);
      user.whatsapp = pengirim;
    }
    if (user.whatsapp !== pengirim) {
      await waClient.sendMessage(
        chatId,
        "❌ Hanya WhatsApp yang terdaftar pada user ini yang dapat mengubah data."
      );
      return;
    }
    let value = valueRaw.trim();

    // 1. Pangkat/title: harus cocok salah satu di DB (distinct, case-insensitive)
    if (fieldNorm === "title") {
      const allTitles = await userService.getDistinctUserTitles();
      const valid = allTitles
        .map((t) => t && t.trim().toLowerCase())
        .filter(Boolean);
      if (!valid.includes(value.toLowerCase())) {
        let msg = "❌ Pangkat tidak valid. List pangkat yang bisa digunakan:\n";
        msg += allTitles.map((t) => "- " + t).join("\n");
        await waClient.sendMessage(chatId, msg);
        return;
      }
    }
    // 2. Satfung/divisi: harus ada pada client_id ini
    if (fieldNorm === "divisi") {
      const allDiv = await userService.getDistinctUserDivisions(user.client_id);
      const valid = allDiv
        .map((d) => d && d.trim().toLowerCase())
        .filter(Boolean);
      if (!valid.includes(value.toLowerCase())) {
        let msg = `❌ Satfung tidak valid untuk POLRES ${user.client_id}. List satfung yang bisa digunakan:\n`;
        msg += allDiv.map((d) => "- " + d).join("\n");
        await waClient.sendMessage(chatId, msg);
        return;
      }
    }

    // 3. Cek duplikasi username insta/tiktok (jika update field insta/tiktok)
    if (fieldNorm === "insta" || fieldNorm === "tiktok") {
      // Bisa gunakan validasi dan parsing seperti sebelumnya (cek duplikat)
      const exists = await userService.findUserByField(fieldNorm, value);
      if (exists && exists.user_id !== user_id) {
        await waClient.sendMessage(
          chatId,
          `❌ Username ${
            fieldNorm === "insta" ? "Instagram" : "TikTok"
          } ini sudah digunakan user lain.`
        );
        return;
      }
      // Validasi format jika ingin ketat (contoh, pakai regex profile IG/tiktok)
      if (fieldNorm === "insta") {
        const igMatch = value.match(
          /^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]+)(\/)?(\?|$)/i
        );
        if (!igMatch) {
          await waClient.sendMessage(
            chatId,
            "❌ Format salah! Masukkan *link profil Instagram*, contoh: https://www.instagram.com/username"
          );
          return;
        }
        value = igMatch[2]; // hanya username
      }
      if (fieldNorm === "tiktok") {
        const ttMatch = value.match(
          /^https?:\/\/(www\.)?tiktok\.com\/@([A-Za-z0-9._]+)(\/)?(\?|$)/i
        );
        if (!ttMatch) {
          await waClient.sendMessage(
            chatId,
            "❌ Format salah! Masukkan *link profil TikTok*, contoh: https://www.tiktok.com/@username"
          );
          return;
        }
        value = "@" + ttMatch[2]; // hanya username (dengan @)
      }
    }

    // 4. Cek WhatsApp unik (hanya boleh satu user)
    if (fieldNorm === "whatsapp") {
      const waInUse = await userService.findUserByWhatsApp(value);
      if (waInUse && waInUse.user_id !== user_id) {
        await waClient.sendMessage(
          chatId,
          "❌ Nomor WhatsApp ini sudah terdaftar pada user lain."
        );
        return;
      }
      value = value.replace(/[^0-9]/g, "");
    }

    // 5. Update field
    await userService.updateUserField(user_id, fieldNorm, value);

    await waClient.sendMessage(
      chatId,
      `✅ Data ${
        fieldNorm === "title"
          ? "pangkat"
          : fieldNorm === "divisi"
          ? "satfung"
          : fieldNorm
      } untuk NRP/NIP ${user_id} berhasil diupdate menjadi *${value}*.`
    );
    return;
  }

  // =========================
  // === TAMPILKAN DATA USER (USER)
  // =========================
  if (text.toLowerCase().startsWith("mydata#")) {
    const [, user_id] = text.split("#");
    if (!user_id) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: mydata#user_id"
      );
      return;
    }
    try {
      const user = await userService.findUserById(user_id);
      if (!user) {
        await waClient.sendMessage(
          chatId,
          `❌ User dengan NRP/NIP ${user_id} tidak ditemukan.`
        );
        return;
      }
      // Nomor pengirim WA (hanya angka)
      let pengirim = chatId.replace(/[^0-9]/g, "");

      // Jika whatsapp masih null/kosong, binding ke nomor ini
      if (!user.whatsapp || user.whatsapp === "") {
        await userService.updateUserField(user_id, "whatsapp", pengirim);
        user.whatsapp = pengirim;
      }

      // --- MODIFIKASI: Tambahkan akses untuk ADMIN_WHATSAPP dan client_operator ---
      // Ambil array admin dari ENV
      const adminNumbers = (process.env.ADMIN_WHATSAPP || "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) =>
          n.endsWith("@c.us") ? n.replace("@c.us", "") : n.replace(/\D/g, "")
        );

      // Cek jika nomor pengirim adalah client_operator pada tabel client milik user ini
      let isOperator = false;
      try {
        if (user.client_id) {
          const q = `SELECT client_operator FROM clients WHERE client_id=$1 LIMIT 1`;
          const res = await pool.query(q, [user.client_id]);
          if (res.rows[0] && res.rows[0].client_operator) {
            let op = res.rows[0].client_operator.replace(/\D/g, "");
            if (op.startsWith("0")) op = "62" + op.slice(1);
            if (pengirim === op) isOperator = true;
          }
        }
      } catch (e) {
        isOperator = false;
      }

      // Cek akses (self, admin, atau operator client)
      const isSelf = user.whatsapp === pengirim;
      const isAdmin = adminNumbers.includes(pengirim);

      if (!isSelf && !isAdmin && !isOperator) {
        await waClient.sendMessage(
          chatId,
          "❌ Hanya WhatsApp yang terdaftar pada user ini, admin, atau operator client yang dapat mengakses data ini."
        );
        return;
      }
      // --- END MODIFIKASI ---

      // Mapping nama tampilan
      const fieldMap = {
        user_id: "NRP/NIP",
        nama: "Nama",
        title: "Pangkat",
        divisi: "Satfung",
        jabatan: "Jabatan",
        status: "Status",
        whatsapp: "WhatsApp",
        insta: "Instagram",
        tiktok: "TikTok",
        client_id: "POLRES",
      };

      // Urutan output
      const order = [
        "user_id",
        "nama",
        "title",
        "divisi",
        "jabatan",
        "status",
        "whatsapp",
        "insta",
        "tiktok",
        "client_id",
      ];

      // Compose pesan (tanpa field exception)
      let msgText = `📋 *Data Anda (${user.user_id}):*\n`;
      order.forEach((k) => {
        if (k === "exception") return;
        if (user[k] !== undefined && user[k] !== null) {
          let val = user[k];
          // Label mapping
          let label = fieldMap[k] || k;
          if (k === "status") {
            val = val === true || val === "true" ? "AKTIF" : "AKUN DIHAPUS";
          }
          msgText += `*${label}*: ${val}\n`;
        }
      });
      await waClient.sendMessage(chatId, msgText);
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal mengambil data: ${err.message}`
      );
    }
    return;
  }

  // =========================
  // === UPDATE STATUS/EXCEPTION (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("exception#")) {
    // Hanya admin dari .env yang boleh pakai command ini!
    if (!isAdminWhatsApp(chatId)) {
      await waClient.sendMessage(
        chatId,
        "❌ Hanya admin yang dapat mengubah data *exception* user."
      );
      return;
    }
    // Format: exception#user_id#true/false
    const [, user_id, valueRaw] = text.split("#");
    if (!user_id || (valueRaw !== "true" && valueRaw !== "false")) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: exception#user_id#true/false"
      );
      return;
    }
    try {
      const user = await userService.findUserById(user_id);
      if (!user) {
        await waClient.sendMessage(
          chatId,
          `❌ User dengan ID ${user_id} tidak ditemukan.`
        );
        return;
      }
      // Update field exception
      await userService.updateUserField(
        user_id,
        "exception",
        valueRaw === "true"
      );
      await waClient.sendMessage(
        chatId,
        `✅ Data *exception* untuk user ${user_id} berhasil diupdate ke: *${valueRaw}*`
      );
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal update exception: ${err.message}`
      );
    }
    return;
  }

  // =========================
  // === LIST ALL EXCEPTION USERS (ADMIN ONLY)
  // =========================
  if (text.toLowerCase() === "allexception") {
    // Hanya admin dari .env yang boleh pakai command ini!
    if (!isAdminWhatsApp(chatId)) {
      await waClient.sendMessage(
        chatId,
        "❌ Hanya admin yang dapat mengakses daftar user exception."
      );
      return;
    }
    try {
      // Ambil semua user yang exception === true
      const exceptionUsers = await userService.getUsersByField(
        "exception",
        true
      );

      if (!exceptionUsers || exceptionUsers.length === 0) {
        await waClient.sendMessage(
          chatId,
          "Tidak ada user yang memiliki exception = true."
        );
        return;
      }

      // Grouping by client_id, lalu divisi
      const grouped = {};
      for (const u of exceptionUsers) {
        const client = u.client_id || "-";
        if (!grouped[client]) grouped[client] = {};
        const divisi = u.divisi || "-";
        if (!grouped[client][divisi]) grouped[client][divisi] = [];
        grouped[client][divisi].push(u);
      }

      let msg = "📋 *DAFTAR USER DENGAN EXCEPTION = TRUE*\n\n";
      Object.entries(grouped).forEach(([client, divObj]) => {
        msg += `*POLRES*: ${client}\n`;
        Object.entries(divObj).forEach(([divisi, list]) => {
          msg += `   *Divisi*: ${divisi} (${list.length} user)\n`;
          list.forEach((u) => {
            msg += `      - ${u.user_id} | ${u.title || ""} ${
              u.nama || ""
            } | Jabatan: ${u.jabatan || ""} | WA: ${u.whatsapp || "-"}\n`;
          });
        });
        msg += "\n";
      });

      await waClient.sendMessage(chatId, msg.trim());
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal mengambil data exception: ${err.message}`
      );
    }
    return;
  }

  // Handler status# tetap bisa digunakan jika memang perlu

  if (text.toLowerCase().startsWith("status#")) {
    // Hanya admin dari .env yang boleh pakai command ini!
    if (!isAdminWhatsApp(chatId)) {
      await waClient.sendMessage(
        chatId,
        "❌ Hanya admin yang dapat mengubah data *status* user."
      );
      return;
    }
    // Format: status#user_id#true/false
    const [, user_id, valueRaw] = text.split("#");
    if (!user_id || (valueRaw !== "true" && valueRaw !== "false")) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: status#user_id#true/false"
      );
      return;
    }
    try {
      const user = await userService.findUserById(user_id);
      if (!user) {
        await waClient.sendMessage(
          chatId,
          `❌ User dengan ID ${user_id} tidak ditemukan.`
        );
        return;
      }
      // Update field status (boolean)
      await userService.updateUserField(user_id, "status", valueRaw === "true");
      await waClient.sendMessage(
        chatId,
        `✅ Data *status* untuk user ${user_id} berhasil diupdate ke: *${valueRaw}*`
      );
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal update status: ${err.message}`
      );
    }
    return;
  }

  // =========================
  // === DEFAULT HANDLER UNTUK PESAN TIDAK DIKENALI
  // =========================

  let userWaNum = chatId.replace(/[^0-9]/g, "");
  const isFirstTime = !knownUserSet.has(userWaNum);
  knownUserSet.add(userWaNum);

  // --- Ambil info client dari nomor WA (operator) ---
  let clientInfoText = "";
  try {
    // Cek ke tabel clients, cari client dengan client_operator=chatId
    // Pastikan client_operator di DB disimpan dalam format 628xxxx
    const q = `SELECT client_id, nama, client_operator FROM clients WHERE client_operator=$1 LIMIT 1`;
    const waId = userWaNum.startsWith("62")
      ? userWaNum
      : "62" + userWaNum.replace(/^0/, "");
    const res = await pool.query(q, [waId]);
    if (res.rows && res.rows[0]) {
      const row = res.rows[0];
      // Format WhatsApp (id WA) -> nomor klik-to-chat
      const waOperator = row.client_operator.replace(/\D/g, "");
      clientInfoText =
        `\n\nHubungi operator Anda:\n` +
        `*${row.nama || row.client_id}* (WA: https://wa.me/${waOperator})`;
    }
  } catch (e) {
    // Tidak ditemukan, biarkan kosong
    clientInfoText = "";
  }

  if (isFirstTime) {
    const menu = `
📝 *Menu User Cicero System*

Balas *angka pilihan* untuk menggunakan menu interaktif:

1️⃣ *Lihat data saya*  
2️⃣ *Update data saya*  
3️⃣ *Daftar perintah manual (userrequest manual)*  
4️⃣ *Kontak operator*

➖➖➖
*Ketik* *userrequest* *untuk membuka menu ini lagi*  
*Ketik* *batal* *untuk keluar dari menu*

${clientInfoText || ""}

--------------------
*Daftar Perintah Manual Lengkap:*
- *mydata#NRP/NIP*  
  > Melihat data user (hanya dapat dilakukan oleh WA yang sudah terdaftar pada user tsb)
  Contoh:  
  \`mydata#75070206\`

- *updateuser#NRP/NIP#field#value*  
  > Mengubah data user (nama, pangkat, satfung, jabatan, insta, tiktok, whatsapp).  
  Contoh:  
  \`updateuser#75070206#pangkat#AKP\`  
  \`updateuser#75070206#satfung#BAGOPS\`  
  \`updateuser#75070206#jabatan#KABAGOPS\`  
  \`updateuser#75070206#insta#https://instagram.com/edisuyono\`  
  \`updateuser#75070206#tiktok#https://tiktok.com/@edisuyono\`  
  \`updateuser#75070206#whatsapp#6281234567890\`

  _Catatan:_
  - Field pangkat & satfung hanya boleh dipilih dari daftar valid.
  - Nomor WhatsApp hanya dapat digunakan satu user.
  - Instagram & TikTok, masukkan link profil (sistem ambil otomatis username).
  - Semua update hanya bisa dilakukan oleh user dengan nomor WhatsApp terdaftar. Jika kosong, akan otomatis terhubung ke nomor pengirim pertama.

- *userrequest*  
  > Membuka menu interaktif ini kapan saja.

--------------------
Jika ingin menggunakan menu manual, copy & paste perintah di atas sesuai kebutuhan.

`.trim();

    await waClient.sendMessage(chatId, menu);
    return;
  }

  // Untuk user lama
  await waClient.sendMessage(
    chatId,
    "🤖 Maaf, perintah yang Anda kirim belum dikenali oleh sistem.\n\n" +
      "Untuk melihat daftar perintah dan bantuan penggunaan, silakan ketik *userrequest*." +
      clientInfoText
  );
  return;
});

// =======================
// INISIALISASI WA CLIENT
// =======================
waClient.initialize();

export default waClient;

// =======================
// === HANDLER ABSENSI LIKES IG
// =======================

async function handleAbsensiLikes(
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
      const sudahDiv = groupByDivision(sudah);
      sortDivisionKeys(Object.keys(sudahDiv)).forEach((div) => {
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

// =======================
// === HANDLER ABSENSI KOMENTAR TIKTOK
// =======================

async function handleAbsensiKomentar(
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
// =======================
// === HANDLER USER MENU ===
// =======================
// ===== Helper =====
function sortDivisionKeys(keys) {
  const order = ["BAG", "SAT", "SI", "POLSEK"];
  return keys.sort((a, b) => {
    const ia = order.findIndex((prefix) => a.toUpperCase().startsWith(prefix));
    const ib = order.findIndex((prefix) => b.toUpperCase().startsWith(prefix));
    return (
      (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
    );
  });
}

function sortTitleKeys(keys, pangkatOrder) {
  // pangkatOrder: array urut dari DB
  return keys.slice().sort((a, b) => {
    const ia = pangkatOrder.indexOf(a);
    const ib = pangkatOrder.indexOf(b);
    return (
      (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
    );
  });
}

// ===== Handler utama usermenu =====
const userMenuHandlers = {
  main: async (session, chatId, text, waClient, pool, userService) => {
    switch (text) {
      case "1":
        session.step = "inputUserId";
        await waClient.sendMessage(
          chatId,
          "Ketik NRP/NIP Anda untuk melihat data. (contoh: 75070206)"
        );
        break;
      case "2":
        session.step = "updateAskUserId";
        await waClient.sendMessage(
          chatId,
          "Ketik NRP/NIP Anda yang ingin diupdate:"
        );
        break;
      case "3":
        await waClient.sendMessage(
          chatId,
          `🛠️ *Daftar Perintah User:*\n\n` +
            `- mydata#NRP/NIP\n` +
            `- updateuser#NRP/NIP#field#value\n` +
            `Contoh: updateuser#75070206#pangkat#AKP\n` +
            `Ketik *batal* untuk keluar dari menu.\n\n` +
            `ℹ️ Untuk update manual, lihat info lengkap: *userrequest* (menu interaktif jauh lebih mudah).`
        );
        break;
      case "4":
        // Cek operator berdasarkan nomor WA user
        let operatorText = "Operator tidak ditemukan di database.";
        try {
          const userWaNum = chatId.replace(/[^0-9]/g, "");
          const q = `SELECT client_id, nama, client_operator FROM clients WHERE client_operator=$1 LIMIT 1`;
          const waId = userWaNum.startsWith("62")
            ? userWaNum
            : "62" + userWaNum.replace(/^0/, "");
          const res = await pool.query(q, [waId]);
          if (res.rows && res.rows[0]) {
            const op = res.rows[0];
            operatorText = `Hubungi Operator:\n*${
              op.nama || op.client_id
            }* (WA: https://wa.me/${op.client_operator.replace(/\D/g, "")})`;
          }
        } catch (e) {}
        await waClient.sendMessage(chatId, operatorText);
        break;
      default:
        await waClient.sendMessage(
          chatId,
          "Pilihan tidak valid. Balas dengan 1, 2, 3, atau 4."
        );
    }
  },

  inputUserId: async (session, chatId, text, waClient, pool, userService) => {
    const user_id = text.replace(/[^0-9a-zA-Z]/g, "");
    if (!user_id) {
      await waClient.sendMessage(
        chatId,
        "NRP/NIP tidak valid. Coba lagi atau ketik *batal*."
      );
      return;
    }
    try {
      const user = await userService.findUserById(user_id);
      if (!user) {
        await waClient.sendMessage(
          chatId,
          `❌ User dengan NRP/NIP ${user_id} tidak ditemukan.`
        );
      } else {
        let pengirim = chatId.replace(/[^0-9]/g, "");
        if (!user.whatsapp || user.whatsapp === "") {
          await userService.updateUserField(user_id, "whatsapp", pengirim);
          user.whatsapp = pengirim;
        }
        if (user.whatsapp !== pengirim) {
          await waClient.sendMessage(
            chatId,
            "❌ Hanya WhatsApp yang terdaftar pada user ini yang dapat mengakses data."
          );
          return;
        }
        // Compose message
        const fieldMap = {
          user_id: "NRP/NIP",
          nama: "Nama",
          title: "Pangkat",
          divisi: "Satfung",
          jabatan: "Jabatan",
          status: "Status",
          whatsapp: "WhatsApp",
          insta: "Instagram",
          tiktok: "TikTok",
          client_id: "POLRES",
        };
        const order = [
          "user_id",
          "nama",
          "title",
          "divisi",
          "jabatan",
          "status",
          "whatsapp",
          "insta",
          "tiktok",
          "client_id",
        ];
        let msgText = `📋 *Data Anda (${user.user_id}):*\n`;
        order.forEach((k) => {
          if (user[k] !== undefined && user[k] !== null) {
            let val = user[k];
            let label = fieldMap[k] || k;
            if (k === "status")
              val = val === true || val === "true" ? "AKTIF" : "AKUN DIHAPUS";
            msgText += `*${label}*: ${val}\n`;
          }
        });
        await waClient.sendMessage(chatId, msgText);
      }
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal mengambil data: ${err.message}`
      );
    }
    session.step = "main";
    await waClient.sendMessage(
      chatId,
      "Anda kembali ke Menu Utama. Pilih menu (1-4) atau *batal*."
    );
  },

  updateAskUserId: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    session.updateUserId = text.replace(/[^0-9a-zA-Z]/g, "");
    session.step = "updateAskField";
    await waClient.sendMessage(
      chatId,
      "Ketik field yang ingin diupdate (nama, pangkat, satfung, jabatan, insta, tiktok, whatsapp):"
    );
  },

  updateAskField: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    const field = text.toLowerCase().trim();
    const allowedFields = [
      "nama",
      "pangkat",
      "satfung",
      "jabatan",
      "insta",
      "tiktok",
      "whatsapp",
    ];
    if (!allowedFields.includes(field)) {
      await waClient.sendMessage(
        chatId,
        `Field tidak valid. Pilih salah satu dari: ${allowedFields.join(", ")}`
      );
      return;
    }
    session.updateField = field;
    // --- jika pangkat/satfung, tampilkan pilihan dari DB & urutkan ---
    if (field === "pangkat") {
      const titles = await userService.getAvailableTitles(); // e.g. ["AKBP","KOMPOL",...,"PENATA TK I","PENGATUR","PENDA"]
      if (!titles || titles.length === 0) {
        await waClient.sendMessage(
          chatId,
          "Data pangkat tidak ditemukan di database."
        );
        return;
      }
      // Urutkan sesuai urutan DB
      let msgList = sortTitleKeys(titles, titles)
        .map((t, i) => `${i + 1}. ${t}`)
        .join("\n");
      await waClient.sendMessage(
        chatId,
        "Daftar pangkat yang dapat dipilih:\n" + msgList
      );
    }
    if (field === "satfung") {
      const satfung = await userService.getAvailableSatfung();
      if (!satfung || satfung.length === 0) {
        await waClient.sendMessage(
          chatId,
          "Data satfung tidak ditemukan di database."
        );
        return;
      }
      let msgList = sortDivisionKeys(satfung)
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n");
      await waClient.sendMessage(
        chatId,
        "Daftar satfung yang dapat dipilih:\n" + msgList
      );
    }
    session.step = "updateAskValue";
    await waClient.sendMessage(
      chatId,
      `Ketik nilai baru untuk field *${field}* (pilih dari daftar jika pangkat/satfung):`
    );
  },

  updateAskValue: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    const user_id = session.updateUserId;
    let field = session.updateField;
    let value = text.trim();

    // Normalisasi field DB
    if (field === "pangkat") field = "title";
    if (field === "satfung") field = "divisi";

    // Cek user
    const user = await userService.findUserById(user_id);
    if (!user) {
      await waClient.sendMessage(
        chatId,
        `❌ User dengan NRP/NIP ${user_id} tidak ditemukan.`
      );
      session.step = "main";
      await waClient.sendMessage(
        chatId,
        "Anda kembali ke Menu Utama. Pilih menu (1-4) atau *batal*."
      );
      return;
    }
    // Cek WA pengirim sama
    const pengirim = chatId.replace(/[^0-9]/g, "");
    if (!user.whatsapp || user.whatsapp === "") {
      await userService.updateUserField(user_id, "whatsapp", pengirim);
      user.whatsapp = pengirim;
    }
    if (user.whatsapp !== pengirim) {
      await waClient.sendMessage(
        chatId,
        "❌ Hanya WhatsApp yang terdaftar pada user ini yang dapat mengubah data."
      );
      session.step = "main";
      await waClient.sendMessage(
        chatId,
        "Anda kembali ke Menu Utama. Pilih menu (1-4) atau *batal*."
      );
      return;
    }

    // --- Validasi hanya bisa update data sesuai DB (tidak boleh custom manual) ---
    if (field === "title") {
      const titles = await userService.getAvailableTitles();
      if (!titles.map((x) => x.toUpperCase()).includes(value.toUpperCase())) {
        await waClient.sendMessage(
          chatId,
          `❌ Pangkat tidak valid! Pilih salah satu dari daftar berikut:\n${sortTitleKeys(
            titles,
            titles
          )
            .map((t, i) => `${i + 1}. ${t}`)
            .join("\n")}`
        );
        return;
      }
      value = titles.find((t) => t.toUpperCase() === value.toUpperCase()); // Normalisasi case
    }
    if (field === "divisi") {
      const satfung = await userService.getAvailableSatfung();
      if (!satfung.map((x) => x.toUpperCase()).includes(value.toUpperCase())) {
        await waClient.sendMessage(
          chatId,
          `❌ Satfung tidak valid! Pilih salah satu dari daftar berikut:\n${sortDivisionKeys(
            satfung
          )
            .map((s, i) => `${i + 1}. ${s}`)
            .join("\n")}`
        );
        return;
      }
      value = satfung.find((s) => s.toUpperCase() === value.toUpperCase());
    }

    // Validasi khusus
    if (field === "insta") {
      const igMatch = value.match(
        /^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]+)/i
      );
      if (!igMatch) {
        await waClient.sendMessage(
          chatId,
          "❌ Format salah! Masukkan *link profil Instagram* (contoh: https://www.instagram.com/username)"
        );
        return;
      }
      value = igMatch[2];
    }
    if (field === "tiktok") {
      const ttMatch = value.match(
        /^https?:\/\/(www\.)?tiktok\.com\/@([A-Za-z0-9._]+)/i
      );
      if (!ttMatch) {
        await waClient.sendMessage(
          chatId,
          "❌ Format salah! Masukkan *link profil TikTok* (contoh: https://www.tiktok.com/@username)"
        );
        return;
      }
      value = "@" + ttMatch[2];
    }
    if (field === "whatsapp") value = value.replace(/[^0-9]/g, "");

    // Update ke DB
    await userService.updateUserField(user_id, field, value);
    await waClient.sendMessage(
      chatId,
      `✅ Data *${
        field === "title" ? "pangkat" : field === "divisi" ? "satfung" : field
      }* untuk NRP/NIP ${user_id} berhasil diupdate menjadi *${value}*.`
    );
    session.step = "main";
    await waClient.sendMessage(
      chatId,
      "Anda kembali ke Menu Utama. Pilih menu (1-4) atau *batal*."
    );
  },
};

// ======================= end of file ======================
