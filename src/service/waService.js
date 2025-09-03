// =======================
// IMPORTS & KONFIGURASI
// =======================
import qrcode from "qrcode-terminal";
import PQueue from "p-queue";
import dotenv from "dotenv";
import { query } from "../db/index.js";
const pool = { query };

// Adapter creators for WhatsApp clients
import { createBaileysClient, refreshAuthState } from "./waAdapter.js";

// Service & Utility Imports
import * as clientService from "./clientService.js";
import * as userModel from "../model/userModel.js";
import * as dashboardUserModel from "../model/dashboardUserModel.js";
import { findByOperator, findBySuperAdmin } from "../model/clientModel.js";
import * as premiumService from "./premiumService.js";
import * as premiumReqModel from "../model/premiumRequestModel.js";
import { migrateUsersFromFolder } from "./userMigrationService.js";
import { checkGoogleSheetCsvStatus } from "./checkGoogleSheetAccess.js";
import { importUsersFromGoogleSheet } from "./importUsersFromGoogleSheet.js";
import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";
import {
  getTiktokSecUid,
  fetchAndStoreTiktokContent,
} from "../handler/fetchpost/tiktokFetchPost.js";
import {
  saveContactIfNew,
  authorize,
  searchByNumbers,
  saveGoogleContact,
} from "./googleContactsService.js";

import {
  absensiLikes,
  absensiLikesPerKonten,
} from "../handler/fetchabsensi/insta/absensiLikesInsta.js";

import {
  absensiKomentar,
  absensiKomentarTiktokPerKonten,
} from "../handler/fetchabsensi/tiktok/absensiKomentarTiktok.js";

// Model Imports
import { getLikesByShortcode } from "../model/instaLikeModel.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { getUsersByClient } from "../model/userModel.js";

// Handler Imports
import { userMenuHandlers } from "../handler/menu/userMenuHandlers.js";
import { clientRequestHandlers } from "../handler/menu/clientRequestHandlers.js";
import { oprRequestHandlers } from "../handler/menu/oprRequestHandlers.js";
import { dashRequestHandlers } from "../handler/menu/dashRequestHandlers.js";
import { dirRequestHandlers } from "../handler/menu/dirRequestHandlers.js";

import { handleFetchKomentarTiktokBatch } from "../handler/fetchengagement/fetchCommentTiktok.js";

// >>> HANYA SATU INI <<< (Pastikan di helper semua diekspor)
import {
  userMenuContext,
  updateUsernameSession,
  knownUserSet,
  setMenuTimeout,
  waBindSessions,
  setBindTimeout,
  operatorOptionSessions,
  setOperatorOptionTimeout,
  adminOptionSessions,
  setAdminOptionTimeout,
  setSession,
  getSession,
  clearSession,
} from "../utils/sessionsHelper.js";

import {
  formatNama,
  groupByDivision,
  sortDivisionKeys,
  normalizeKomentarArr,
  getGreeting,
  formatUserData,
} from "../utils/utilsHelper.js";
import {
  isAdminWhatsApp,
  formatToWhatsAppId,
  formatClientData,
  safeSendMessage,
  getAdminWAIds,
  isUnsupportedVersionError,
} from "../utils/waHelper.js";
import {
  IG_PROFILE_REGEX,
  TT_PROFILE_REGEX,
  adminCommands,
} from "../utils/constants.js";

dotenv.config();

const messageQueue = new PQueue({ concurrency: 1 });

function randomDelay() {
  return 2000 + Math.floor(Math.random() * 3000);
}

// Helper ringkas untuk menampilkan data user
function formatUserSummary(user) {
  return (
    "👤 *Identitas Anda*\n" +
    `*Nama*     : ${user.nama || "-"}\n` +
    `*Pangkat*  : ${user.title || "-"}\n` +
    `*NRP/NIP*  : ${user.user_id || "-"}\n` +
    `*Satfung*  : ${user.divisi || "-"}\n` +
    `*Jabatan*  : ${user.jabatan || "-"}\n` +
    (user.ditbinmas ? `*Desa Binaan* : ${user.desa || "-"}\n` : "") +
    `*Instagram*: ${user.insta ? "@" + user.insta.replace(/^@/, "") : "-"}\n` +
    `*TikTok*   : ${user.tiktok || "-"}\n` +
    `*Status*   : ${
      user.status === true || user.status === "true" ? "🟢 AKTIF" : "🔴 NONAKTIF"
    }`
  ).trim();
}

// =======================
// INISIALISASI CLIENT WA
// =======================

// Inisialisasi WhatsApp client melalui Baileys
const refreshAuth = process.env.WA_REFRESH_AUTH === "true";
if (refreshAuth) {
  refreshAuthState();
}
export let waClient = await createBaileysClient({ refreshAuth });

async function reconnectBaileys() {
  console.log("[WA] Reconnecting to Baileys client");
  try {
    await waClient?.disconnect();
  } catch {}
  waClient = await createBaileysClient();
  waClient.onDisconnect(handleDisconnect);
  wrapSendMessage(waClient);
  await waClient.connect();
}

function handleDisconnect(reason) {
  waReady = false;
  console.warn("[WA] Client disconnected:", reason);
  reconnectBaileys();
}

waClient.onDisconnect(handleDisconnect);

let waReady = false;
const pendingMessages = [];
const readyResolvers = [];
const adminNotificationQueue = [];

function flushPendingMessages() {
  if (pendingMessages.length) {
    console.log(`[WA] Processing ${pendingMessages.length} deferred message(s)`);
    pendingMessages.splice(0).forEach((msg) => {
      console.log(`[WA] Processing deferred message from ${msg.from}`);
      waClient.emit("message", msg);
    });
  }
}

export function queueAdminNotification(message) {
  adminNotificationQueue.push(message);
}

export function flushAdminNotificationQueue() {
  if (!adminNotificationQueue.length) return;
  console.log(
    `[WA] Sending ${adminNotificationQueue.length} queued admin notification(s)`
  );
  adminNotificationQueue.splice(0).forEach((msg) => {
    for (const wa of getAdminWAIds()) {
      safeSendMessage(waClient, wa, msg);
    }
  });
}

function markWaReady(src = "unknown") {
  if (!waReady) {
    waReady = true;
    console.log(`[WA] READY via ${src}`);
    readyResolvers.splice(0).forEach((resolve) => resolve());
  }
  flushPendingMessages();
  flushAdminNotificationQueue();
}

export function waitForWaReady(timeout = 30000) {
  if (waReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer;
    const resolver = () => {
      clearTimeout(timer);
      resolve();
    };
    readyResolvers.push(resolver);
    timer = setTimeout(() => {
      const idx = readyResolvers.indexOf(resolver);
      if (idx !== -1) readyResolvers.splice(idx, 1);
      reject(new Error("WhatsApp client not ready"));
    }, timeout);
  });
}

// Pastikan semua pengiriman pesan menunggu hingga client siap
function wrapSendMessage(client) {
  const original = client.sendMessage;
  client._originalSendMessage = original;

  async function sendWithRetry(args, attempt = 0) {
    try {
      try {
        await waitForWaReady();
      } catch {
        console.warn("[WA] sendMessage called before ready");
      }
      return await original.apply(client, args);
    } catch (err) {
      const isRateLimit = err?.data === 429 || err?.message === "rate-overlimit";
      if (!isRateLimit || attempt >= 4) throw err;
      const baseDelay = 2 ** attempt * 1000;
      const jitter = Math.floor(Math.random() * 0.2 * baseDelay);
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
      return sendWithRetry(args, attempt + 1);
    }
  }

  client.sendMessage = (...args) => {
    return messageQueue.add(() => sendWithRetry(args), { delay: randomDelay() });
  };
}
wrapSendMessage(waClient);

// Handle QR code (scan)
waClient.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("[WA] Scan QR dengan WhatsApp Anda!");
});

// Wa Bot siap
waClient.once("ready", () => {
  markWaReady("ready");
});

// Log client states during initialization
waClient.on("loading_screen", (percent, message) => {
  console.log(`[WA] Loading ${percent}%: ${message}`);
});

waClient.on("authenticated", () => {
  console.log("[WA] Client authenticated");
});

waClient.on("auth_failure", (msg) => {
  waReady = false;
  console.error("[WA] Authentication failure:", msg);
});

waClient.on("change_state", (state) => {
  console.log(`[WA] Client state changed: ${state}`);
  if (state === "CONNECTED") markWaReady("state");
});

// =======================
// MESSAGE HANDLER UTAMA
// =======================
waClient.on("message", async (msg) => {
  const chatId = msg.from;
  const text = (msg.body || "").trim();
  console.log(`[WA] Incoming message from ${chatId}: ${text}`);
  if (msg.isStatus) {
    console.log(`[WA] Ignored status message from ${chatId}`);
    return;
  }
  if (chatId?.endsWith("@g.us") && !text.toLowerCase().startsWith("thisgroup#")) {
    console.log(`[WA] Ignored group message from ${chatId}`);
    return;
  }
  if (!waReady) {
    console.warn(
      `[WA] Client not ready, message from ${msg.from} deferred`
    );
    pendingMessages.push(msg);
    waClient
      .sendMessage(msg.from, "🤖 Bot sedang memuat, silakan tunggu")
      .catch(() => {
        console.warn(
          `[WA] Failed to notify ${msg.from} about loading state`
        );
      });
    return;
  }

  // ===== Deklarasi State dan Konstanta =====
  const session = getSession(chatId);
  // Hindari query ke tabel saved_contact saat menangani dashrequest
  if (
    !(
      ["dashrequest", "dirrequest"].includes(text.toLowerCase()) ||
      (session && ["dashrequest", "dirrequest"].includes(session.menu))
    ) &&
    !chatId.endsWith("@g.us")
  ) {
    await saveContactIfNew(chatId);
  }
  const userWaNum = chatId.replace(/[^0-9]/g, "");
  const isAdminCommand = adminCommands.some((cmd) =>
    text.toLowerCase().startsWith(cmd)
  );
  const senderId = msg.author || chatId;
  const isAdmin = isAdminWhatsApp(senderId);

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

  // ===== Pilihan awal untuk nomor operator =====
  if (operatorOptionSessions[chatId]) {
    if (/^1$/.test(text.trim())) {
      delete operatorOptionSessions[chatId];
      setSession(chatId, { menu: "oprrequest", step: "main" });
      await oprRequestHandlers.main(
        getSession(chatId),
        chatId,
        `┏━━━ *MENU OPERATOR CICERO* ━━━┓\n👮‍♂️  Hanya untuk operator client.\n\n1️⃣ Tambah user baru\n2️⃣ Ubah status user (aktif/nonaktif)\n3️⃣ Cek data user (NRP/NIP)\n4️⃣ Update Tugas\n5️⃣ Rekap link harian\n6️⃣ Rekap link per post\n7️⃣ Absensi Amplifikasi User\n8️⃣ Absensi Registrasi User\n🔟 Tugas Khusus\n1️⃣1️⃣ Rekap link tugas khusus\n1️⃣2️⃣ Rekap per post khusus\n1️⃣3️⃣ Absensi Amplifikasi Khusus\n\nKetik *angka menu* di atas, atau *batal* untuk keluar.\n┗━━━━━━━━━━━━━━━━━━━━━━━━┛`,
        waClient,
        pool,
        userModel
      );
      return;
    }
    if (/^2$/.test(text.trim())) {
      delete operatorOptionSessions[chatId];
      const pengirim = chatId.replace(/[^0-9]/g, "");
      const userByWA = await userModel.findUserByWhatsApp(pengirim);
      const salam = getGreeting();
        if (userByWA) {
          userMenuContext[chatId] = { step: "confirmUserByWaUpdate", user_id: userByWA.user_id };
          const msg = `${salam}, Bapak/Ibu\n${formatUserSummary(userByWA)}\n\nApakah Anda ingin melakukan perubahan data?\nBalas *ya* untuk memulai update atau *tidak* untuk melewati.`;
          await waClient.sendMessage(chatId, msg.trim());
          setMenuTimeout(chatId, waClient, true);
        } else {
          userMenuContext[chatId] = { step: "inputUserId" };
          const msg =
            `${salam}! Nomor WhatsApp Anda belum terdaftar.` +
            "\n\nBalas pesan ini dengan memasukan NRP Anda," +
            "\n\n*Contoh Pesan Balasan : 87020990*";
          await waClient.sendMessage(chatId, msg.trim());
          setMenuTimeout(chatId, waClient, true);
        }
        return;
      }
    await waClient.sendMessage(chatId, "Balas *1* untuk Menu Operator atau *2* untuk perubahan data username.");
    setOperatorOptionTimeout(chatId);
    return;
  }

  // ===== Pilihan awal untuk nomor admin =====
  if (adminOptionSessions[chatId]) {
    if (/^1$/.test(text.trim())) {
      delete adminOptionSessions[chatId];
      setSession(chatId, { menu: "clientrequest", step: "main" });
      await waClient.sendMessage(
        chatId,
        `┏━━━ *MENU CLIENT CICERO* ━━━\n1️⃣ Tambah client baru\n2️⃣ Kelola client (update/hapus/info)\n3️⃣ Kelola user (update/exception/status)\n4️⃣ Proses Instagram\n5️⃣ Proses TikTok\n6️⃣ Absensi Username Instagram\n7️⃣ Absensi Username TikTok\n8️⃣ Transfer User\n9️⃣ Exception Info\n🔟 Hapus WA Admin\n1️⃣1️⃣ Hapus WA User\n1️⃣2️⃣ Transfer User Sheet\n1️⃣3️⃣ Download Sheet Amplifikasi\n1️⃣4️⃣ Download Sheet Amplifikasi Bulan sebelumnya\n1️⃣5️⃣ Download Docs\n1️⃣6️⃣ Absensi Operator Ditbinmas\n1️⃣7️⃣ Hapus Session Baileys\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━\nKetik *angka* menu, atau *batal* untuk keluar.`
      );
      return;
    }
    if (/^2$/.test(text.trim())) {
      delete adminOptionSessions[chatId];
      const waId = userWaNum.startsWith("62")
        ? userWaNum
        : "62" + userWaNum.replace(/^0/, "");
      const operator = await findByOperator(waId);
      const superAdmin = await findBySuperAdmin(waId);
      if (!operator && !superAdmin && !isAdmin) {
        await waClient.sendMessage(
          chatId,
          "❌ Nomor Anda bukan operator atau super admin yang terdaftar."
        );
        return;
      }
      setSession(chatId, { menu: "oprrequest", step: "main" });
      await oprRequestHandlers.main(
        getSession(chatId),
        chatId,
        `┏━━━ *MENU OPERATOR CICERO* ━━━┓\n👮‍♂️  Hanya untuk operator client.\n\n1️⃣ Tambah user baru\n2️⃣ Ubah status user (aktif/nonaktif)\n3️⃣ Cek data user (NRP/NIP)\n4️⃣ Update Tugas\n5️⃣ Rekap link harian\n6️⃣ Rekap link per post\n7️⃣ Absensi Amplifikasi User\n8️⃣ Absensi Registrasi User\n🔟 Tugas Khusus\n1️⃣1️⃣ Rekap link tugas khusus\n1️⃣2️⃣ Rekap per post khusus\n1️⃣3️⃣ Absensi Amplifikasi Khusus\n\nKetik *angka menu* di atas, atau *batal* untuk keluar.\n┗━━━━━━━━━━━━━━━━━━━━━━━━┛`,
        waClient,
        pool,
        userModel
      );
      return;
    }
    if (/^3$/.test(text.trim())) {
      delete adminOptionSessions[chatId];
      const pengirim = chatId.replace(/[^0-9]/g, "");
      const userByWA = await userModel.findUserByWhatsApp(pengirim);
      const salam = getGreeting();
        if (userByWA) {
          userMenuContext[chatId] = { step: "confirmUserByWaUpdate", user_id: userByWA.user_id };
          const msg = `${salam}, Bapak/Ibu\n${formatUserSummary(userByWA)}\n\nApakah Anda ingin melakukan perubahan data?\nBalas *ya* untuk memulai update atau *tidak* untuk melewati.`;
          await waClient.sendMessage(chatId, msg.trim());
          setMenuTimeout(chatId, waClient, true);
        } else {
          userMenuContext[chatId] = { step: "inputUserId" };
          const msg =
            `${salam}! Nomor WhatsApp Anda belum terdaftar.` +
            "\n\nBalas pesan ini dengan memasukan NRP Anda," +
            "\n\n*Contoh Pesan Balasan : 87020990*";
          await waClient.sendMessage(chatId, msg.trim());
          setMenuTimeout(chatId, waClient, true);
        }
        return;
      }
    await waClient.sendMessage(chatId, "Balas *1* untuk Menu Client, *2* untuk Menu Operator, atau *3* untuk perubahan data username.");
    setAdminOptionTimeout(chatId);
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

  if (session && session.menu === "dashrequest") {
    await dashRequestHandlers[session.step || "main"](
      session,
      chatId,
      text,
      waClient
    );
    return;
  }

  if (session && session.menu === "dirrequest") {
    await dirRequestHandlers[session.step || "main"](
      session,
      chatId,
      text,
      waClient
    );
    return;
  }

  // ===== MULAI Menu Operator dari command manual =====
  if (text.toLowerCase() === "oprrequest") {
    const waId =
      userWaNum.startsWith("62") ? userWaNum : "62" + userWaNum.replace(/^0/, "");
    const operator = await findByOperator(waId);
    const superAdmin = await findBySuperAdmin(waId);
    if (!operator && !superAdmin && !isAdmin) {
      await waClient.sendMessage(
        chatId,
        "❌ Menu ini hanya dapat diakses oleh operator atau super admin yang terdaftar."
      );
      return;
    }
    setSession(chatId, { menu: "oprrequest", step: "main" });
    await oprRequestHandlers.main(
      getSession(chatId),
      chatId,
      `┏━━━ *MENU OPERATOR CICERO* ━━━┓
👮‍♂️  Hanya untuk operator client.

1️⃣ Tambah user baru
2️⃣ Ubah status user (aktif/nonaktif)
3️⃣ Cek data user (NRP/NIP)
4️⃣ Update Tugas
5️⃣ Rekap link harian
6️⃣ Rekap link per post
7️⃣ Absensi Amplifikasi User
8️⃣ Absensi Registrasi User
🔟 Tugas Khusus
1️⃣1️⃣ Rekap link tugas khusus
1️⃣2️⃣ Rekap per post khusus
1️⃣3️⃣ Absensi Amplifikasi Khusus

Ketik *angka menu* di atas, atau *batal* untuk keluar.
┗━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
      waClient,
      pool,
      userModel
    );
    return;
  }

  // ===== Menu Dashboard =====
  // Validasi nomor hanya berdasarkan tabel dashboard_user tanpa fallback ke saved_contact
  if (text.toLowerCase() === "dashrequest") {
    const waId =
      userWaNum.startsWith("62") ? userWaNum : "62" + userWaNum.replace(/^0/, "");
    const dashUsers = await dashboardUserModel.findAllByWhatsApp(waId);
    const validUsers = dashUsers.filter(
      (u) => u.status === true && u.role !== "operator"
    );
    if (validUsers.length === 0) {
      await waClient.sendMessage(
        chatId,
        "❌ Nomor Anda tidak terdaftar atau belum disetujui sebagai dashboard user."
      );
      return;
    }
    if (validUsers.length === 1) {
      const du = validUsers[0];
      let dirClientId = null;
      try {
        const roleClient = await clientService.findClientById(du.role);
        if (roleClient?.client_type?.toLowerCase() === "direktorat") {
          dirClientId = du.role;
        }
      } catch (e) {
        // ignore lookup errors and fallback to dashboard user client_ids
      }
      setSession(chatId, {
        menu: "dashrequest",
        step: "main",
        role: du.role,
        client_ids: du.client_ids,
        dir_client_id: dirClientId,
      });
      await dashRequestHandlers.main(getSession(chatId), chatId, "", waClient);
      return;
    }
    setSession(chatId, {
      menu: "dashrequest",
      step: "choose_dash_user",
      dash_users: validUsers,
    });
    await dashRequestHandlers.choose_dash_user(
      getSession(chatId),
      chatId,
      "",
      waClient
    );
    return;
  }

  if (text.toLowerCase() === "dirrequest") {
    const waId =
      userWaNum.startsWith("62")
        ? userWaNum
        : "62" + userWaNum.replace(/^0/, "");
    const dashUsers = await dashboardUserModel.findAllByWhatsApp(waId);
    const validUsers = dashUsers.filter(
      (u) => u.status === true && u.role !== "operator"
    );
    if (validUsers.length === 0) {
      await waClient.sendMessage(
        chatId,
        "❌ Nomor Anda tidak terdaftar atau belum disetujui sebagai dashboard user."
      );
      return;
    }
    if (validUsers.length === 1) {
      const du = validUsers[0];
      let dirClientId = null;
      try {
        const roleClient = await clientService.findClientById(du.role);
        if (roleClient?.client_type?.toLowerCase() === "direktorat") {
          dirClientId = du.role;
        }
      } catch (e) {
        // ignore lookup errors and fallback to dashboard user client_ids
      }
      setSession(chatId, {
        menu: "dirrequest",
        step: "main",
        role: du.role,
        client_ids: du.client_ids,
        dir_client_id: dirClientId,
      });
      await dirRequestHandlers.main(getSession(chatId), chatId, "", waClient);
      return;
    }
    setSession(chatId, {
      menu: "dirrequest",
      step: "choose_dash_user",
      dash_users: validUsers,
    });
    await dirRequestHandlers.choose_dash_user(
      getSession(chatId),
      chatId,
      "",
      waClient
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
    setMenuTimeout(chatId, waClient);
    const session = userMenuContext[chatId];
    const handler = userMenuHandlers[session.step];
    if (handler) {
      await handler(session, chatId, text, waClient, pool, userModel);
      if (session.exit) {
        clearTimeout(session.timeout);
        clearTimeout(session.warningTimeout);
        clearTimeout(session.noReplyTimeout);
        delete userMenuContext[chatId];
      } else {
        setMenuTimeout(chatId, waClient, true);
      }
    } else {
      await waClient.sendMessage(
        chatId,
        "⚠️ Sesi menu user tidak dikenal, silakan ketik *userrequest* ulang atau *batal*."
      );
      clearTimeout(session.timeout);
      clearTimeout(session.warningTimeout);
      clearTimeout(session.noReplyTimeout);
      delete userMenuContext[chatId];
    }
    return;
  }

  // ========== Mulai Menu Interaktif User ==========
  if (text.toLowerCase() === "userrequest") {
    userMenuContext[chatId] = {};
    try {
      await userMenuHandlers.main(
        userMenuContext[chatId],
        chatId,
        "",
        waClient,
        pool,
        userModel
      );
      setMenuTimeout(chatId, waClient, true);
    } catch (err) {
      if (isUnsupportedVersionError(err)) {
        await safeSendMessage(
          waClient,
          chatId,
          "Versi WhatsApp Anda tidak mendukung menu ini. Silakan update aplikasi melalui Play Store:\nhttps://play.google.com/store/apps/details?id=com.whatsapp"
        );
      } else {
        console.error(`[WA] userrequest menu error: ${err.message}`);
      }
    }
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
9️⃣ Exception Info
🔟 Hapus WA Admin
1️⃣1️⃣ Hapus WA User
1️⃣2️⃣ Transfer User Sheet
1️⃣3️⃣ Download Sheet Amplifikasi
1️⃣4️⃣ Download Sheet Amplifikasi Bulan sebelumnya
1️⃣5️⃣ Download Docs
1️⃣6️⃣ Absensi Operator Ditbinmas
1️⃣7️⃣ Hapus Session Baileys
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ketik *angka* menu, atau *batal* untuk keluar.
`.trim()
    );
    return;
  }


  // ========== VALIDASI ADMIN COMMAND ==========
  if (
    isAdminCommand &&
    !isAdmin &&
    !text.toLowerCase().startsWith("thisgroup#")
  ) {
    await waClient.sendMessage(
      chatId,
      "❌ Anda tidak memiliki akses ke sistem ini."
    );
    return;
  }

  if (text.toLowerCase() === "savecontact") {
    try {
      const auth = await authorize();
      const users = await userModel.getActiveUsersWithWhatsapp();
      let saved = 0;
      for (const u of users) {
        const exists = await searchByNumbers(auth, [u.whatsapp]);
        if (exists.length === 0) {
          await saveGoogleContact(auth, { name: u.nama, phone: u.whatsapp });
          saved++;
        }
      }
      await waClient.sendMessage(
        chatId,
        `✅ Kontak tersimpan ke Google: ${saved}`
      );
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal menyimpan kontak: ${err.message}`
      );
    }
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
        "Nomor WhatsApp Anda belum terhubung ke data user mana pun.\nSilakan masukkan NRP Anda untuk melakukan binding akun atau balas *batal* untuk keluar:"
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
        "NRP yang Anda masukkan tidak valid. Coba lagi atau balas *batal* untuk membatalkan."
      );
      return;
    }
    const user = await userModel.findUserById(nrp);
    if (!user) {
      await waClient.sendMessage(
        chatId,
        `❌ NRP *${nrp}* tidak ditemukan. Jika yakin benar, hubungi Opr Humas Polres Anda.`
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
    // Require at least 50% of content liked to mark as complete
    const threshold = Math.ceil(totalKonten * 0.5);

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
        u.count >= threshold
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
              } (${u.count} konten)${
                !u.insta ? " (belum mengisi data insta)" : ""
              }`
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
      const { query } = await import("../db/index.js");
      const q =
        "SELECT client_tiktok FROM clients WHERE client_id = $1 LIMIT 1";
      const result = await query(q, [client_id]);
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
  // === UPDATE client_group dari WhatsApp GROUP
  // =========================
  if (text.toLowerCase().startsWith("thisgroup#")) {
    if (!msg.from.endsWith("@g.us")) {
      await waClient.sendMessage(
        chatId,
        "❌ Perintah ini hanya bisa digunakan di dalam group WhatsApp!"
      );
      return;
    }
    const [, rawClientId] = text.split("#");
    const client_id = (rawClientId || "").trim();
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
        await waClient.sendMessage(senderId, dataText);
        await waClient.sendMessage(
          chatId,
          "✅ Group ID telah dikirim ke chat pribadi Anda."
        );
        if (updated.client_operator && updated.client_operator.length >= 8) {
          const operatorId = formatToWhatsAppId(updated.client_operator);
          if (operatorId !== senderId) {
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



  // =========================
  // === APPROVE / DENY DASHBOARD ADMIN
  // =========================
  if (text.toLowerCase().startsWith("approvedash#")) {
    const [, usernameRaw] = text.split("#");
    const username = usernameRaw?.trim();
    if (!username) {
      await waClient.sendMessage(chatId, "Format salah! Gunakan: approvedash#username");
      return;
    }
    const usr = await dashboardUserModel.findByUsername(username);
    if (!usr) {
      await waClient.sendMessage(chatId, `❌ Username ${username} tidak ditemukan.`);
      return;
    }
    await dashboardUserModel.updateStatus(usr.dashboard_user_id, true);
    await waClient.sendMessage(chatId, `✅ User ${usr.username} disetujui.`);
    if (usr.whatsapp) {
      await safeSendMessage(
        waClient,
        formatToWhatsAppId(usr.whatsapp),
        `✅ Registrasi dashboard Anda telah disetujui.\nUsername: ${usr.username}`
      );
    }
    return;
  }

  if (text.toLowerCase().startsWith("denydash#")) {
    const [, usernameRaw] = text.split("#");
    const username = usernameRaw?.trim();
    if (!username) {
      await waClient.sendMessage(chatId, "Format salah! Gunakan: denydash#username");
      return;
    }
    const usr = await dashboardUserModel.findByUsername(username);
    if (!usr) {
      await waClient.sendMessage(chatId, `❌ Username ${username} tidak ditemukan.`);
      return;
    }
    await dashboardUserModel.updateStatus(usr.dashboard_user_id, false);
    await waClient.sendMessage(chatId, `❌ User ${usr.username} ditolak.`);
    if (usr.whatsapp) {
      await safeSendMessage(
        waClient,
        formatToWhatsAppId(usr.whatsapp),
        `❌ Registrasi dashboard Anda ditolak.\nUsername: ${usr.username}`
      );
    }
    return;
  }

  // =========================
  // === APPROVE / DENY SUBSCRIPTION
  // =========================
  if (text.toLowerCase().startsWith("grantsub#")) {
    const [, id] = text.split("#");
    if (!id) {
      await waClient.sendMessage(chatId, "Format salah! Gunakan: grantsub#id");
      return;
    }
    const reqRow = await premiumReqModel.findRequestById(Number(id));
    if (!reqRow || reqRow.status !== "pending") {
      await waClient.sendMessage(chatId, `❌ Request ${id} tidak valid.`);
      return;
    }
    await premiumReqModel.updateRequest(Number(id), { status: "approved" });
    await userModel.updatePremiumStatus(reqRow.user_id, true, null);
    await waClient.sendMessage(chatId, `✅ Request ${id} disetujui.`);
    const user = await userModel.findUserById(reqRow.user_id);
    if (user?.whatsapp) {
      await safeSendMessage(
        waClient,
        formatToWhatsAppId(user.whatsapp),
        "✅ Langganan premium Anda aktif."
      );
    }
    return;
  }

  if (text.toLowerCase().startsWith("denysub#")) {
    const [, id] = text.split("#");
    if (!id) {
      await waClient.sendMessage(chatId, "Format salah! Gunakan: denysub#id");
      return;
    }
    const reqRow = await premiumReqModel.findRequestById(Number(id));
    if (!reqRow || reqRow.status !== "pending") {
      await waClient.sendMessage(chatId, `❌ Request ${id} tidak valid.`);
      return;
    }
    await premiumReqModel.updateRequest(Number(id), { status: "rejected" });
    await waClient.sendMessage(chatId, `❌ Request ${id} ditolak.`);
    const user = await userModel.findUserById(reqRow.user_id);
    if (user?.whatsapp) {
      await safeSendMessage(
        waClient,
        formatToWhatsAppId(user.whatsapp),
        "❌ Permintaan langganan Anda ditolak."
      );
    }
    return;
  }

  // ========== Fallback Handler ==========
  const isFirstTime = !knownUserSet.has(userWaNum);
  knownUserSet.add(userWaNum);

  let clientInfoText = "";
  let operatorRow = null;
  try {
    const q = `SELECT client_id, nama, client_operator FROM clients WHERE client_operator=$1 LIMIT 1`;
    const waId = userWaNum.startsWith("62")
      ? userWaNum
      : "62" + userWaNum.replace(/^0/, "");
    const res = await query(q, [waId]);
    if (res.rows && res.rows[0]) {
      operatorRow = res.rows[0];
      const waOperator = operatorRow.client_operator.replace(/\D/g, "");
      clientInfoText =
        `\n\nHubungi operator Anda:\n` +
        `*${operatorRow.nama || operatorRow.client_id}* (WA: https://wa.me/${waOperator})`;
    }
  } catch (e) {
    clientInfoText = "";
  }

  if (isFirstTime) {
    if (isAdmin) {
      adminOptionSessions[chatId] = {};
      setAdminOptionTimeout(chatId);
      const salam = getGreeting();
        await safeSendMessage(
          waClient,
          chatId,
          `${salam}! Nomor ini terdaftar sebagai *admin*.` +
            "\n1️⃣ Menu Client" +
            "\n2️⃣ Menu Operator" +
            "\n3️⃣ Perubahan Data Username" +
            "\nBalas angka *1*, *2*, atau *3*."
        );
      return;
    }
    if (operatorRow) {
      operatorOptionSessions[chatId] = {};
      setOperatorOptionTimeout(chatId);
      const salam = getGreeting();
        await safeSendMessage(
          waClient,
          chatId,
          `${salam}! Nomor ini terdaftar sebagai *operator* untuk client *${
            operatorRow.nama || operatorRow.client_id
          }*.` +
            "\n1️⃣ Menu Operator" +
            "\n2️⃣ Perubahan Data Username" +
            "\nBalas angka *1* atau *2*."
        );
      return;
    }
    const pengirim = chatId.replace(/[^0-9]/g, "");
    const userByWA = await userModel.findUserByWhatsApp(pengirim);
    const salam = getGreeting();
      if (userByWA) {
        userMenuContext[chatId] = { step: "confirmUserByWaUpdate", user_id: userByWA.user_id };
        const msg = `${salam}, Bapak/Ibu\n${formatUserSummary(userByWA)}\n\nApakah Anda ingin melakukan perubahan data?\nBalas *ya* untuk memulai update atau *tidak* untuk melewati.`;
        await safeSendMessage(waClient, chatId, msg.trim());
        setMenuTimeout(chatId, waClient, true);
      } else {
        userMenuContext[chatId] = { step: "inputUserId" };
        const msg =
          `${salam}! Nomor WhatsApp Anda belum terdaftar.` +
          clientInfoText +
          "\n\nBalas pesan ini dengan memasukan NRP Anda," +
          "\n\n*Contoh Pesan Balasan : 87020990*";
        await safeSendMessage(waClient, chatId, msg.trim());
        setMenuTimeout(chatId, waClient, true);
      }
    return;
  }

  // Proses binding WhatsApp jika nomor belum terdaftar
  const senderWa = chatId.replace(/[^0-9]/g, "");
  const userByWAExist = await userModel.findUserByWhatsApp(senderWa);

  if (!userByWAExist) {
    if (waBindSessions[chatId]) {
      const session = waBindSessions[chatId];
      if (session.step === "ask_nrp") {
        if (text.trim().toLowerCase() === "batal") {
          delete waBindSessions[chatId];
          await waClient.sendMessage(chatId, "Proses dibatalkan. Silakan masukkan NRP Anda untuk memulai.");
          waBindSessions[chatId] = { step: "ask_nrp" };
          setBindTimeout(chatId);
          return;
        }
        const lower = text.trim().toLowerCase();
        if (lower === "userrequest") {
          await waClient.sendMessage(
            chatId,
            "Panduan:\n1. Ketik NRP Anda (angka saja) untuk mendaftar." +
              "\n2. Balas *batal* untuk membatalkan proses."
          );
          return;
        }
        const nrp = text.trim();
        if (!/^\d+$/.test(nrp)) {
          await waClient.sendMessage(
            chatId,
            "Balas pesan ini dengan NRP Anda, \n*Contoh Pesan Balasan : 87020990*"
          );
          return;
        }
        const user = await userModel.findUserById(nrp);
        if (!user) {
          await waClient.sendMessage(chatId, `❌ NRP *${nrp}* tidak ditemukan. Jika yakin benar, hubungi Opr Humas Polres Anda.`);
          return;
        }
        session.step = "confirm";
        session.user_id = user.user_id;
        setBindTimeout(chatId);
        await waClient.sendMessage(
          chatId,
          `Apakah Anda ingin menghubungkan nomor WhatsApp ini dengan NRP *${nrp}*?\n` +
            "Satu username hanya bisa menggunakan satu akun WhatsApp.\n" +
            "Balas *ya* untuk menyetujui atau *tidak* untuk membatalkan."
        );
        return;
      }
      if (session.step === "confirm") {
        if (text.trim().toLowerCase() === "ya") {
          const nrp = session.user_id;
          await userModel.updateUserField(nrp, "whatsapp", senderWa);
          const user = await userModel.findUserById(nrp);
          await waClient.sendMessage(
            chatId,
            `✅ Nomor WhatsApp berhasil dihubungkan ke NRP *${nrp}*.\n` +
              `${formatUserSummary(user)}`
          );
          delete waBindSessions[chatId];
          return;
        }
        if (text.trim().toLowerCase() === "tidak") {
          delete waBindSessions[chatId];
          await waClient.sendMessage(chatId, "Baik, proses dibatalkan. Silakan masukkan NRP Anda untuk melanjutkan.");
          waBindSessions[chatId] = { step: "ask_nrp" };
          setBindTimeout(chatId);
          return;
        }
        await waClient.sendMessage(chatId, "Balas *ya* untuk menyetujui, atau *tidak* untuk membatalkan.");
        return;
      }
    } else {
      waBindSessions[chatId] = { step: "ask_nrp" };
      setBindTimeout(chatId);
      await waClient.sendMessage(
        chatId,
        "🤖 Maaf, perintah yang Anda kirim belum dikenali. Silakan masukkan NRP Anda untuk melanjutkan proses binding akun atau balas *batal* untuk keluar:"
      );
      return;
    }
  }

  // Untuk user lama (pesan tidak dikenal)
  await waClient.sendMessage(
    chatId,
    "🤖 Maaf, perintah yang Anda kirim belum dikenali oleh sistem.\n\n" +
      "Untuk melihat daftar perintah dan bantuan penggunaan, silakan ketik *userrequest*." +
      clientInfoText
  );
  console.log(`[WA] Message from ${chatId} processed with fallback handler`);
  return;
});

// Fallback handler for environments that emit `message_create` instead of `message`
waClient.on("message_create", (msg) => {
  if (msg.fromMe) return;
  waClient.emit("message", msg);
});

// =======================
// INISIALISASI WA CLIENT
// =======================
console.log("[WA] Starting WhatsApp client initialization");
try {
  await waClient.connect();
} catch (err) {
  console.error("[WA] Initialization failed:", err.message);
}

// Watchdog: jika event 'ready' tidak muncul, cek state setelah 60 detik
setTimeout(async () => {
  try {
    const state = await waClient.getState();
    console.log("[WA] getState:", state);
    if (state === "CONNECTED") markWaReady("getState");
  } catch (e) {
    console.log("[WA] getState error:", e?.message);
  }
}, 60000);

export default waClient;

// ======================= end of file ======================
