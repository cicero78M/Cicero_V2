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
import * as userService from "./userService.js";

import { migrateUsersFromFolder } from "./userMigrationService.js";
import { checkGoogleSheetCsvStatus } from "./checkGoogleSheetAccess.js";
import { importUsersFromGoogleSheet } from "./importUsersFromGoogleSheet.js";

import { fetchAndStoreInstaContent } from "../handler/fetchPost/instaFetchPost.js";
import {
  getTiktokSecUid,
  fetchAndStoreTiktokContent,
} from "../handler/fetchPost/tiktokFetchPost.js";

// Model Imports
import { getLikesByShortcode } from "../model/instaLikeModel.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { getUsersByClient } from "../model/userModel.js";

// handlers

import { userMenuHandlers } from "../handler/menu/userMenuHandlers.js";
import { clientRequestHandlers } from "../handler/menu/clientRequestHandlers.js";
import { oprRequestHandlers } from "../handler/menu/oprRequestHandlers.js";
import { handleAbsensiKomentar } from "../handler/fetchAbsensi/tiktok/absensiKomentarTiktok.js";

// helper functions
import {
  formatNama,
  groupByDivision,
  sortDivisionKeys,
  normalizeKomentarArr,
} from "../utils/utilsHelper.js";
import {
  isAdminWhatsApp,
  formatToWhatsAppId,
  formatClientData,
} from "../utils/waHelper.js";
import {
  setMenuTimeout,
  setSession,
  getSession,
  clearSession,
} from "../utils/sessionsHelper.js";

import { sendDebug } from "../middleware/debugHandler.js";

import {
  IG_PROFILE_REGEX,
  TT_PROFILE_REGEX,
  adminCommands,
} from "../utils/constants.js";

dotenv.config();

// Tambah di atas (global scope)
const userMenuContext = {};
const updateUsernameSession = {};
const knownUserSet = new Set();

// =======================
// INISIALISASI CLIENT WA
// =======================

// Inisialisasi WhatsApp client dengan LocalAuth
const waClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true },
});

// Handle QR code (scan)
waClient.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("[WA] Scan QR dengan WhatsApp Anda!");
});

// Wa Bot siap
waClient.on("ready", () => {
  console.log("[WA] WhatsApp client is ready!");
});

// =======================
// MESSAGE HANDLER UTAMA
// =======================
waClient.on("message", async (msg) => {
  const chatId = msg.from;
  const text = msg.body.trim();

  const session = getSession(chatId);

  const isAdminCommand = adminCommands.some((cmd) =>
    text.toLowerCase().startsWith(cmd)
  );

  // ===== Keluar dari menu user =====
  if (userMenuContext[chatId] && text.toLowerCase() === "batal") {
    delete userMenuContext[chatId];
    await waClient.sendMessage(chatId, "✅ Menu User ditutup. Terima kasih.");
    return;
  }

  // ==== Keluar session ====
  if (getSession(chatId) && text.toLowerCase() === "batal") {
    clearSession(chatId);
    await waClient.sendMessage(chatId, "✅ Menu Admin Client ditutup.");
    return;
  }

  // Fallback: Jika step "main" tapi input bukan 1/2/3/4 atau "batal"
  if (userMenuContext[chatId] && userMenuContext[chatId].step === "main") {
    if (!["1", "2", "3", "4"].includes(text.trim())) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas dengan 1, 2, 3, atau 4."
      );
      return;
    }
  }

  if (session && session.menu === "oprrequest") {
    await oprRequestHandlers[session.step || "main"](
      session,
      chatId,
      text,
      waClient,
      pool,
      userService
    );
    return;
  }

  if (session && session.menu === "clientrequest") {
    const handler = clientRequestHandlers[session.step || "main"];
    if (handler) {
      await handler(
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
        handleAbsensiKomentar
      );
    }
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

  if (isAdminCommand && !isAdminWhatsApp(chatId)) {
    await waClient.sendMessage(
      chatId,
      "❌ Anda tidak memiliki akses ke sistem ini."
    );
    return;
  }

  // Tangkap pesan hanya link IG/TikTok (tanpa # dan lain-lain)
  if (
    !text.includes("#") &&
    (IG_PROFILE_REGEX.test(text.trim()) || TT_PROFILE_REGEX.test(text.trim()))
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

  // Proses konfirmasi update username
  if (
    updateUsernameSession[chatId] &&
    updateUsernameSession[chatId].step === "confirm"
  ) {
    const jawaban = text.trim().toLowerCase();
    if (["tidak", "batal", "no", "cancel"].includes(jawaban)) {
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
    // Ekstrak username dan field (IG atau TikTok)
    let username = null;
    let field = null;
    let match = null;
    if ((match = updateUsernameSession[chatId].link.match(IG_PROFILE_REGEX))) {
      username = match[2].toLowerCase();
      field = "insta";
    } else if (
      (match = updateUsernameSession[chatId].link.match(TT_PROFILE_REGEX))
    ) {
      username = "@" + match[2].replace(/^@+/, "").toLowerCase();
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

    // Ambil nomor WA (selalu angka, tanpa @c.us)
    let waNum = chatId.replace(/[^0-9]/g, "");
    // Cek user berdasarkan nomor WhatsApp
    let user = (await userService.findUserByWhatsApp)
      ? await userService.findUserByWhatsApp(waNum)
      : await userService.findUserByWhatsApp(waNum);
    if (user) {
      // Update username (standar: IG tanpa @, TT selalu pakai @)
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
      // WA belum terdaftar, minta NRP/NIP
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

  // Proses binding NRP/NIP
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
    // Ambil nomor WA dari pengirim
    let waNum = chatId.replace(/[^0-9]/g, "");
    // Pastikan nomor WA belum dipakai user lain!
    let waUsed = (await userService.findUserByWhatsApp)
      ? await userService.findUserByWhatsApp(waNum)
      : await userService.findUserByWA(waNum);
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
    await userService.updateUserField(user.user_id, "whatsapp", waNum);
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

  // =======================
  // HANDLER PERINTAH ADMIN CICERO
  // =======================

  if (text.toLowerCase() === "clientrequest") {
    if (!isAdminWhatsApp(chatId)) {
      await waClient.sendMessage(
        chatId,
        "❌ Anda tidak memiliki akses ke menu ini."
      );
      return;
    }
    // PENTING: Routing session harus benar
    setSession(chatId, { menu: "clientrequest", step: "main" });
    await waClient.sendMessage(
      chatId,
      `🛠️ *Menu Admin Client Cicero*\n` +
        `Balas angka pilihan:\n` +
        `1️⃣. Tambah client baru\n` +
        `2️⃣. Update client\n` +
        `3️⃣. Hapus client\n` +
        `4️⃣. Info client\n` +
        `5️⃣. Transfer user dari folder\n` +
        `6️⃣. Import user dari Google Sheet\n` +
        `7️⃣. Fetch Instagram\n` +
        `8️⃣. Fetch TikTok\n` +
        `9️⃣. Rekap absensi likes IG\n` +
        `🔟. Rekap absensi komentar TikTok\n` +
        `1️⃣1️⃣. Daftar perintah manual (advanced)\n` +
        `1️⃣2️⃣. Update *exception* user\n` +
        `1️⃣3️⃣. Update *status* user\n` +
        `1️⃣4️⃣. Daftar *allexception* user\n` +
        `1️⃣5️⃣. Request data *Instagram* user\n` +
        `1️⃣6️⃣. Request data *TikTok* user\n` +
        `1️⃣7️⃣. Fetch *likes* Instagram (semua konten hari ini)\n` +
        `1️⃣8️⃣. Fetch *komentar* TikTok (semua konten hari ini)\n\n` +
        `Ketik *batal* untuk keluar dari menu.`
    );
    return;
  }

  // =======================
  // HANDLER PERINTAH OPERATOR CICERO
  // =======================

  if (text.toLowerCase() === "oprrequest") {
    let session = getSession(chatId);
    if (!session) session = {};
    session.menu = "oprrequest";
    session.step = "main"; // atau step lain sesuai kebutuhan
    setSession(chatId, session);
    // Cek apakah nomor WA user adalah operator pada client manapun
    const pengirim = chatId.replace(/[^0-9]/g, "");
    const q = `SELECT client_id FROM clients WHERE client_operator=$1 LIMIT 1`;
    const waId = pengirim.startsWith("62")
      ? pengirim
      : "62" + pengirim.replace(/^0/, "");
    const res = await pool.query(q, [waId]);
    if (!res.rows || !res.rows[0]) {
      await waClient.sendMessage(
        chatId,
        "Menu ini hanya dapat diakses oleh operator client."
      );
      return;
    }
    session.menu = "oprrequest";
    session.step = "main";
    await oprRequestHandlers.main(
      session,
      chatId,
      text,
      waClient,
      pool,
      userService
    );
    return;
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
      const exceptionUsers = await userService.getAllExceptionUsers(
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
  // === MENU COMMANDS (CLIENT/USER)
  // =========================
  if (text.toLowerCase() === "advancedclientrequest") {
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

// ======================= end of file ======================
