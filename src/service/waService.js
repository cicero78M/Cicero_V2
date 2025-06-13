// =======================
// IMPORTS & KONFIGURASI
// =======================
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import dotenv from "dotenv";
import { pool } from "../config/db.js";

// Service & Utility Imports
import * as clientService from "./clientService.js";
import * as userModel from "../model/userModel.js";
import { migrateUsersFromFolder } from "./userMigrationService.js";
import { checkGoogleSheetCsvStatus } from "./checkGoogleSheetAccess.js";
import { importUsersFromGoogleSheet } from "./importUsersFromGoogleSheet.js";
import { fetchAndStoreInstaContent } from "../handler/fetchPost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchEngagement/fetchLikesInstagram.js";
import {
  getTiktokSecUid,
  fetchAndStoreTiktokContent,
} from "../handler/fetchPost/tiktokFetchPost.js";

import {
  absensiLikes,
  absensiLikesPerKonten,
} from "../handler/fetchAbsensi/insta/absensiLikesInsta.js";

import {
  absensiKomentar,
  absensiKomentarTiktokPerKonten,
} from "../handler/fetchAbsensi/tiktok/absensiKomentarTiktok.js";

// Model Imports
import { getLikesByShortcode } from "../model/instaLikeModel.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { getUsersByClient } from "../model/userModel.js";

// Handler Imports
import { userMenuHandlers } from "../handler/menu/userMenuHandlers.js";
import { clientRequestHandlers } from "../handler/menu/clientRequestHandlers.js";
import { oprRequestHandlers } from "../handler/menu/oprRequestHandlers.js";

import { handleFetchKomentarTiktokBatch } from "../handler/fetchEngagement/fetchCommentTiktok.js";

// >>> HANYA SATU INI <<< (Pastikan di helper semua diekspor)
import {
  userMenuContext,
  updateUsernameSession,
  knownUserSet,
  setMenuTimeout,
  setSession,
  getSession,
  clearSession,
} from "../utils/sessionsHelper.js";

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
  IG_PROFILE_REGEX,
  TT_PROFILE_REGEX,
  adminCommands,
} from "../utils/constants.js";

dotenv.config();

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
    // Routing pesan sesuai langkah/session operator (tambah user, update status, dst)
    await oprRequestHandlers[session.step || "main"](
      session,
      chatId,
      text,
      waClient,
      pool,
      userModel
    );
    return;
  }

  // ===== MULAI Menu Operator dari command manual =====
  if (text.toLowerCase() === "oprrequest") {
    setSession(chatId, { menu: "oprrequest", step: "main" });
    await oprRequestHandlers.main(
      getSession(chatId),
      chatId,
      `┏━━━ *MENU OPERATOR CICERO* ━━━┓
👮‍♂️  Hanya untuk operator client.
  
1️⃣ Tambah user baru
2️⃣ Ubah status user (aktif/nonaktif)
3️⃣ Cek data user (NRP/NIP)

Ketik *angka menu* di atas, atau *batal* untuk keluar.
┗━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
      waClient,
      pool,
      userModel
    );
    return;
  }

  // -- Routing semua step session clientrequest ke handler step terkait --
  if (session && session.menu === "clientrequest") {
    // Jika user membatalkan menu clientrequest
    if (text.toLowerCase() === "batal") {
      clearSession(chatId);
      await waClient.sendMessage(chatId, "✅ Menu Client ditutup.");
      return;
    }

    // Panggil handler berdasarkan step
    const handler = clientRequestHandlers[session.step || "main"];
    if (typeof handler === "function") {
      await handler(
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
        handleFetchLikesInstagram,
        handleFetchKomentarTiktokBatch
      );
    } else {
      // Step tidak dikenali, reset session
      clearSession(chatId);
      await waClient.sendMessage(
        chatId,
        "⚠️ Sesi menu client tidak dikenali. Ketik *clientrequest* ulang atau *batal*."
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
      await handler(session, chatId, text, waClient, pool, userModel);
    } else {
      await waClient.sendMessage(
        chatId,
        "⚠️ Sesi menu user tidak dikenal, silakan ketik *userrequest* ulang atau *batal*."
      );
      delete userMenuContext[chatId];
    }
    return;
  }

  // ========== Mulai Menu Interaktif User ==========
  if (text.toLowerCase() === "userrequest") {
    userMenuContext[chatId] = { step: "main" };
    setMenuTimeout(chatId);
    await waClient.sendMessage(
      chatId,
      `
┏━━━━━━━ *MENU UTAMA USER* ━━━━━━━┓
  1️⃣  Lihat Data Saya
  2️⃣  Update Data Saya
  3️⃣  Daftar Perintah Manual
  4️⃣  Hubungi Operator
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Silakan balas angka *1-4* atau ketik *batal* untuk keluar.
`.trim()
    );
    return;
  }

  // ===== Handler Menu Client =====
  if (text.toLowerCase() === "clientrequest") {
    setSession(chatId, { menu: "clientrequest", step: "main" });
    await waClient.sendMessage(
      chatId,
`
┏━━━ *MENU CLIENT CICERO* ━━━
1️⃣ Tambah client baru
2️⃣ Kelola client (update/hapus/info)
3️⃣ Kelola user (update/exception/status)
4️⃣ Proses Instagram
5️⃣ Proses TikTok
6️⃣ Absensi Username Instagram
7️⃣ Absensi Username TikTok
8️⃣ Transfer User
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ketik *angka* menu, atau *batal* untuk keluar.
`.trim()
    );
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
    let user = await userModel.findUserByWhatsApp(waNum);
    if (user) {
      await userModel.updateUserField(user.user_id, field, username);
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
    const user = await userModel.findUserById(nrp);
    if (!user) {
      await waClient.sendMessage(
        chatId,
        `User dengan NRP/NIP *${nrp}* tidak ditemukan. Coba lagi atau balas *batal* untuk membatalkan.`
      );
      return;
    }
    let waNum = chatId.replace(/[^0-9]/g, "");
    let waUsed = await userModel.findUserByWhatsApp(waNum);
    if (waUsed && waUsed.user_id !== user.user_id) {
      await waClient.sendMessage(
        chatId,
        `Nomor WhatsApp ini sudah terpakai pada NRP/NIP *${waUsed.user_id}*. Hanya satu user per WA yang diizinkan.`
      );
      delete updateUsernameSession[chatId];
      return;
    }
    await userModel.updateUserField(
      user.user_id,
      updateUsernameSession[chatId].field,
      updateUsernameSession[chatId].username
    );
    await userModel.updateUserField(user.user_id, "whatsapp", waNum);
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

  // =========================
  // === FETCH INSTAGRAM (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("fetchinsta#")) {
    // format: fetchinsta#clientid#[key1,key2,...]
    const [, client_id_raw, keys_raw] = text.split("#");
    const client_id = (client_id_raw || "").trim().toUpperCase();

    // Default key list (optional, bisa modifikasi)
    const defaultKeys = ["shortcode", "caption", "like_count", "timestamp"];

    // Keys: array, jika ada, pisahkan koma
    let keys = defaultKeys;
    if (keys_raw && keys_raw.trim()) {
      keys = keys_raw.split(",").map((k) => k.trim());
    }

    if (!client_id) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nfetchinsta#clientid#[key1,key2,...]\nContoh: fetchinsta#JAKARTA#shortcode,caption"
      );
      return;
    }

    try {
      await fetchAndStoreInstaContent(keys, waClient, chatId, client_id); // pass client_id!
      await waClient.sendMessage(
        chatId,
        `✅ Selesai fetch Instagram untuk ${client_id}.`
      );
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal fetch/simpan IG: ${err.message}`
      );
    }
    return;
  }

  // =========================
  // === FETCH TIKTOK MANUAL (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("fetchtiktok#")) {
    // Format: fetchtiktok#CLIENTID
    const [, client_id_raw] = text.split("#");
    const client_id = (client_id_raw || "").trim().toUpperCase();

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
      // Pastikan fetchAndStoreTiktokContent menerima client_id sebagai param pertama!
      const { fetchAndStoreTiktokContent } = await import(
        "../service/tiktokFetchService.js"
      );
      const posts = await fetchAndStoreTiktokContent(
        client_id,
        waClient,
        chatId
      );

      if (!posts || posts.length === 0) {
        // fallback: dari DB
        const { getPostsTodayByClient } = await import(
          "../model/tiktokPostModel.js"
        );
        const postsDB = await getPostsTodayByClient(client_id);
        if (!postsDB || postsDB.length === 0) {
          await waClient.sendMessage(
            chatId,
            `❌ Tidak ada post TikTok hari ini untuk client *${client_id}*`
          );
          return;
        } else {
          await waClient.sendMessage(
            chatId,
            `⚠️ Tidak ada post baru dari API, menggunakan data dari database...`
          );
          // lanjut rekap dari DB (lihat di bawah)
          // NOTE: postsDB yang dipakai, bukan posts!
          // kode rekap di bawah
          postsDB.forEach((item, i) => {
            // isi seperti di bawah
          });
        }
      }

      // Ambil username TikTok client (untuk format link)
      let username = "-";
      try {
        const { findById } = await import("../model/clientModel.js");
        const client = await findById(client_id);
        username = client?.client_tiktok || "-";
        if (username.startsWith("@")) username = username.slice(1);
      } catch (userErr) {
        // skip
      }

      // Rekap dan kirim pesan
      let rekap = `*Rekap Post TikTok Hari Ini*\nClient: *${client_id}*\n\n`;
      const postsList = posts && posts.length > 0 ? posts : postsDB;
      rekap += `Jumlah post: *${postsList.length}*\n\n`;
      postsList.forEach((item, i) => {
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
        rekap += `#${i + 1} Video ID: ${video_id}\n`;
        rekap += `   Deskripsi: ${desc.slice(0, 50)}\n`;
        rekap += `   Tanggal: ${created}\n`;
        rekap += `   Like: ${
          item.digg_count ?? item.like_count ?? 0
        } | Komentar: ${item.comment_count ?? 0}\n`;
        rekap += `   Link: https://www.tiktok.com/@${username}/video/${video_id}\n\n`;
      });

      await waClient.sendMessage(chatId, rekap.trim());
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ ERROR: ${err.message}`);
    }
    return;
  }

  // =========================
  // === FETCH LIKES INSTAGRAM (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("fetchlikes#")) {
    // Format: fetchlikes#clientid
    const [, client_id_raw] = text.split("#");
    const client_id = (client_id_raw || "").trim().toUpperCase();

    if (!client_id) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: fetchlikes#clientid\nContoh: fetchlikes#POLRESABC"
      );
      return;
    }

    await waClient.sendMessage(
      chatId,
      "⏳ Mengambil & memperbarui data likes IG..."
    );

    // Update likes IG dulu (opsional, kalau handler-mu sudah update DB dari API, bisa skip try/catch ini)
    try {
      await handleFetchLikesInstagram(client_id, null, waClient, chatId);
      // handler ini update DB, lanjut rekap dari DB saja
    } catch (e) {
      await waClient.sendMessage(
        chatId,
        `⚠️ Gagal update likes IG dari API: ${e.message}\nAkan menampilkan data dari database terakhir.`
      );
    }

    // Ambil user & list shortcode (konten IG hari ini) dari database
    const users = await getUsersByClient(client_id);
    const shortcodes = await getShortcodesTodayByClient(client_id);

    if (!shortcodes || shortcodes.length === 0) {
      await waClient.sendMessage(
        chatId,
        `❌ Tidak ada konten IG untuk *${client_id}* hari ini.`
      );
      return;
    }

    const hariIndo = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const now = new Date();
    const hari = hariIndo[now.getDay()];
    const tanggal = now.toLocaleDateString("id-ID");
    const jam = now.toLocaleTimeString("id-ID", { hour12: false });

    const kontenLinks = shortcodes.map(
      (sc) => `https://www.instagram.com/p/${sc}`
    );
    const totalKonten = shortcodes.length;

    // Rekap likes untuk setiap user: hitung berapa konten yang di-like
    const userStats = {};
    users.forEach((u) => {
      userStats[u.user_id] = { ...u, count: 0 };
    });

    for (const shortcode of shortcodes) {
      const likes = await getLikesByShortcode(shortcode);
      const likesSet = new Set(
        (likes || []).map((l) => (l || "").toLowerCase())
      );
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

    // Pesan Rekap
    let msg =
      `📋 Rekap Likes Instagram\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
      `*Jumlah Konten:* ${totalKonten}\n` +
      `*Daftar link konten hari ini:*\n${kontenLinks.join("\n")}\n\n` +
      `*Jumlah user:* ${users.length}\n` +
      `✅ Sudah melaksanakan: *${sudah.length}*\n` +
      `❌ Belum melaksanakan: *${belum.length}*\n\n`;

    msg += `✅ Sudah melaksanakan (${sudah.length} user):\n`;
    const sudahDiv = groupByDivision(sudah);
    sortDivisionKeys(Object.keys(sudahDiv)).forEach((div) => {
      const list = sudahDiv[div];
      msg += `*${div}* (${list.length} user):\n`;
      msg +=
        list
          .map(
            (u) =>
              `- ${formatNama(u)} : ${u.insta || "belum mengisi data insta"} (${
                u.count
              } konten)${!u.insta ? " (belum mengisi data insta)" : ""}`
          )
          .join("\n") + "\n\n";
    });

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

    msg += "\nTerimakasih.";
    await waClient.sendMessage(chatId, msg.trim());
    return;
  }

  // =========================
  // === FETCH KOMENTAR TIKTOK (ADMIN)
  // =========================

  if (text.toLowerCase().startsWith("fetchcomments#")) {
    // Format: fetchcomments#clientid
    const [, client_id_raw] = text.split("#");
    const client_id = (client_id_raw || "").trim().toUpperCase();

    if (!client_id) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: fetchcomments#clientid\nContoh: fetchcomments#POLRESABC"
      );
      return;
    }

    await waClient.sendMessage(
      chatId,
      "⏳ Mengambil & memperbarui data komentar TikTok..."
    );

    // Update komentar TikTok dari API (jika ada handler update komentar)
    try {
      const { getPostsTodayByClient } = await import(
        "../model/tiktokPostModel.js"
      );
      const { fetchAndStoreTiktokComments } = await import(
        "../service/tiktokCommentService.js"
      );
      const posts = await getPostsTodayByClient(client_id);
      for (const post of posts) {
        const video_id = post.video_id || post.id;
        await fetchAndStoreTiktokComments(video_id);
      }
    } catch (e) {
      await waClient.sendMessage(
        chatId,
        `⚠️ Gagal update komentar TikTok dari API: ${e.message}\nAkan menampilkan data dari database terakhir.`
      );
    }

    // Ambil user, post, dan komentar dari database
    const users = await getUsersByClient(client_id);
    const { getPostsTodayByClient } = await import(
      "../model/tiktokPostModel.js"
    );
    const { getCommentsByVideoId } = await import(
      "../model/tiktokCommentModel.js"
    );
    const posts = await getPostsTodayByClient(client_id);

    // Ambil username TikTok client
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

    if (!posts || posts.length === 0) {
      await waClient.sendMessage(
        chatId,
        `❌ Tidak ada post TikTok untuk *${client_id}* hari ini.`
      );
      return;
    }

    const hariIndo = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const now = new Date();
    const hari = hariIndo[now.getDay()];
    const tanggal = now.toLocaleDateString("id-ID");
    const jam = now.toLocaleTimeString("id-ID", { hour12: false });

    const kontenLinks = posts.map(
      (p) =>
        `https://www.tiktok.com/@${client_tiktok}/video/${p.video_id || p.id}`
    );
    const totalKonten = posts.length;

    // Rekap komentar untuk setiap user: hitung berapa video yang sudah dikomentari
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
    Object.values(userStats).forEach((u) => {
      if (u.exception) {
        sudah.push(u); // Selalu masuk sudah, apapun kondisinya
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

    // Pesan Rekap
    let msg =
      `📋 Rekap Komentar TikTok\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
      `*Jumlah Konten:* ${totalKonten}\n` +
      `*Daftar link video hari ini:*\n${kontenLinks.join("\n")}\n\n` +
      `*Jumlah user:* ${users.length}\n` +
      `✅ Sudah melaksanakan: *${sudah.length}*\n` +
      `❌ Belum melaksanakan: *${belum.length}*\n\n`;

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

    msg += "\nTerimakasih.";
    await waClient.sendMessage(chatId, msg.trim());
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

    // Optional: always update konten sebelum rekap (atau masukkan ke dalam helper kalau mau DRY full)
    try {
      await fetchAndStoreInstaContent(null, waClient, chatId, client_id);
    } catch (e) {
      await waClient.sendMessage(
        chatId,
        `⚠️ Gagal update konten IG: ${e.message}\nAbsensi tetap dilanjutkan dengan data terakhir di database.`
      );
    }

    try {
      let msg = "";
      if (filter1 === "akumulasi") {
        if (filter2 === "sudah") {
          msg = await absensiLikes(client_id, { mode: "sudah" });
        } else if (filter2 === "belum") {
          msg = await absensiLikes(client_id, { mode: "belum" });
        } else {
          msg = await absensiLikes(client_id, { mode: "all" });
        }
      } else if (["sudah", "belum", ""].includes(filter1)) {
        if (filter1 === "sudah") {
          msg = await absensiLikesPerKonten(client_id, { mode: "sudah" });
        } else if (filter1 === "belum") {
          msg = await absensiLikesPerKonten(client_id, { mode: "belum" });
        } else {
          msg = await absensiLikesPerKonten(client_id, { mode: "all" });
        }
      } else {
        await waClient.sendMessage(
          chatId,
          "Format salah! Pilih mode [akumulasi|sudah|belum], contoh:\nabsensilikes#clientid#akumulasi#sudah"
        );
        return;
      }
      await waClient.sendMessage(chatId, msg || "Data tidak ditemukan.");
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Error: ${err.message}`);
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

    try {
      let msg = "";
      // === Akumulasi Mode ===
      if (filter1 === "akumulasi") {
        if (filter2 === "sudah") {
          msg = await absensiKomentar(client_id, { mode: "sudah" });
        } else if (filter2 === "belum") {
          msg = await absensiKomentar(client_id, { mode: "belum" });
        } else {
          msg = await absensiKomentar(client_id, { mode: "all" });
        }
      }
      // === Per-Konten Mode ===
      else if (["sudah", "belum", ""].includes(filter1)) {
        if (filter1 === "sudah") {
          msg = await absensiKomentarTiktokPerKonten(client_id, {
            mode: "sudah",
          });
        } else if (filter1 === "belum") {
          msg = await absensiKomentarTiktokPerKonten(client_id, {
            mode: "belum",
          });
        } else {
          msg = await absensiKomentarTiktokPerKonten(client_id, {
            mode: "all",
          });
        }
      } else {
        await waClient.sendMessage(
          chatId,
          "Format salah! Pilih mode [akumulasi|sudah|belum], contoh:\nabsensikomentar#clientid#akumulasi#sudah"
        );
        return;
      }
      await waClient.sendMessage(chatId, msg || "Data tidak ditemukan.");
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Error: ${err.message}`);
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
        tiktok_secuid: "",
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

    // === OTOMATIS UPDATE tiktok_secuid ===
    if (parts.length === 3 && parts[2] === "tiktok_secuid") {
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
          tiktok_secuid: secUid,
        });
        if (updated) {
          let dataText = formatClientData(
            updated,
            `✅ tiktok_secuid untuk client *${client_id}* berhasil diupdate dari username *@${username}*:\n\n*secUid*: ${secUid}\n\n*Data Terbaru:*`
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
        "atau updateclient#clientid#tiktok_secuid (untuk update secUid otomatis dari username TikTok)"
    );
    return;
  }

  // =========================
  // === GET CLIENT INFO (ADMIN)
  // =========================
  if (text.toLowerCase().startsWith("clientinfo#")) {
    const [, client_id_raw] = text.split("#");
    const client_id = (client_id_raw || "").trim();
    // Jika tidak ada client_id: tampilkan daftar semua client
    if (!client_id) {
      try {
        // Pastikan fungsi ini sudah diekspor dari clientService.js
        const { getAllClientIds } = await import("../service/clientService.js");
        const list = await getAllClientIds();
        if (!list.length) {
          await waClient.sendMessage(chatId, "Belum ada client terdaftar.");
          return;
        }
        let msg = "*Daftar Client Terdaftar:*\n";
        msg += list
          .map(
            (c, i) =>
              `${i + 1}. *${c.client_id}* - ${c.nama || "-"} [${
                c.status ? "AKTIF" : "TIDAK AKTIF"
              }]`
          )
          .join("\n");
        msg += "\n\nKetik: clientinfo#clientid\nContoh: clientinfo#JAKARTA";
        await waClient.sendMessage(chatId, msg);
      } catch (e) {
        await waClient.sendMessage(
          chatId,
          "Gagal mengambil daftar client: " + e.message
        );
      }
      return;
    }

    // Lanjut: clientinfo#clientid
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
