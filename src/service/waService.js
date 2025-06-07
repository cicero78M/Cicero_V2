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
import { handleFetchLikesInstagram } from "../handler/fetchEngagement/fetchLikesInstagram.js";

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
import { handleFetchKomentarTiktokBatch } from "../handler/fetchEngagement/fetchCommentTiktok.js";



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

  // ===== Deklarasi State dan Konstanta =====
  const session = getSession(chatId);
  const userWaNum = chatId.replace(/[^0-9]/g, "");
  const isAdminCommand = adminCommands.some((cmd) =>
    text.toLowerCase().startsWith(cmd)
  );
  const isAdmin = isAdminWhatsApp(chatId);

  // =========== Menu User Interaktif ===========
  if (userMenuContext[chatId] && text.toLowerCase() === "batal") {
    delete userMenuContext[chatId];
    await waClient.sendMessage(chatId, "✅ Menu User ditutup. Terima kasih.");
    return;
  }
  if (getSession(chatId) && text.toLowerCase() === "batal") {
    clearSession(chatId);
    await waClient.sendMessage(chatId, "✅ Menu Admin Client ditutup.");
    return;
  }
  if (
    userMenuContext[chatId] &&
    userMenuContext[chatId].step === "main" &&
    !["1", "2", "3", "4"].includes(text.trim())
  ) {
    await waClient.sendMessage(
      chatId,
      "Pilihan tidak valid. Balas dengan 1, 2, 3, atau 4."
    );
    return;
  }

  // ===== Handler Menu Operator =====
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

  // ===== Handler Menu Client =====
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
        handleFetchLikesInstagram,
        handleAbsensiKomentar
      );
    }
    return;
  }

  // ===== Handler Menu User Interaktif Step Lanjut =====
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

  // ========== VALIDASI ADMIN COMMAND ==========
  if (isAdminCommand && !isAdmin) {
    await waClient.sendMessage(
      chatId,
      "❌ Anda tidak memiliki akses ke sistem ini."
    );
    return;
  }

  // ========== Update Username via Link Profile IG/TikTok ==========
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

  // ========== Proses Konfirmasi Update Username ==========
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
    // Ekstrak username
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
    let waNum = chatId.replace(/[^0-9]/g, "");
    let user = (await userService.findUserByWhatsApp)
      ? await userService.findUserByWhatsApp(waNum)
      : await userService.findUserByWA(waNum);
    if (user) {
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

  // ========== Proses Binding NRP/NIP ==========
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
    let waNum = chatId.replace(/[^0-9]/g, "");
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

  // ========== Mulai Menu Interaktif User ==========
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

  // =========================
  // === IG: ABSENSI LIKES
  // =========================
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

  // =========================
  // === TIKTOK: ABSENSI KOMENTAR
  // =========================
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
    const groupId = msg.from;
    try {
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
        client_super: "",
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
          updateObj[key] = value;
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
      const result = await migrateUsersFromFolder(client_id);
      let report = `*Hasil transfer user dari client ${client_id}:*\n`;
      result.forEach((r) => {
        report += `- ${r.file}: ${r.status}${
          r.error ? " (" + r.error + ")" : ""
        }\n`;
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
    return;
  }

  // ========== Fallback Handler ==========
  const isFirstTime = !knownUserSet.has(userWaNum);
  knownUserSet.add(userWaNum);

  let clientInfoText = "";
  try {
    const q = `SELECT client_id, nama, client_operator FROM clients WHERE client_operator=$1 LIMIT 1`;
    const waId = userWaNum.startsWith("62")
      ? userWaNum
      : "62" + userWaNum.replace(/^0/, "");
    const res = await pool.query(q, [waId]);
    if (res.rows && res.rows[0]) {
      const row = res.rows[0];
      const waOperator = row.client_operator.replace(/\D/g, "");
      clientInfoText =
        `\n\nHubungi operator Anda:\n` +
        `*${row.nama || row.client_id}* (WA: https://wa.me/${waOperator})`;
    }
  } catch (e) {
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

  // Untuk user lama (pesan tidak dikenal)
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
