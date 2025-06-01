// =======================
// IMPORTS & KONFIGURASI
// =======================
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import dotenv from "dotenv";

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

import {
  fetchAndStoreTiktokContent,
  fetchAllTikTokCommentsToday, getTiktokSecUid
} from "./tiktokFetchService.js";


dotenv.config();

// =======================
// HELPER FUNCTIONS
// =======================

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
    "transferuser#",
    "sheettransfer#",
    "thisgroup#",
    "requestinsta#",
    "requesttiktok#",
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
    const headerLaporan = `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar dan Likes pada Akun Official :\n\n`;
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

    // 4. === Mode Akumulasi ===
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

      // Rekap sudah/belum per divisi (satfung)
      const sudahPerSatfung = {};
      const belumPerSatfung = {};
      let totalSudah = 0,
        totalBelum = 0;

      Object.values(userStats).forEach((u) => {
        const satfung = u.divisi || "-";
        const nama = [u.title, u.nama].filter(Boolean).join(" ");
        const label =
          u.insta && u.insta.trim() !== ""
            ? `${nama} : ${u.insta} (${u.count} konten)`
            : `${nama} : belum mengisi data insta (${u.count} konten)`;
        if (
          u.insta &&
          u.insta.trim() !== "" &&
          u.count >= Math.ceil(totalKonten / 2)
        ) {
          if (!sudahPerSatfung[satfung]) sudahPerSatfung[satfung] = [];
          sudahPerSatfung[satfung].push(label);
          totalSudah++;
        } else {
          if (!belumPerSatfung[satfung]) belumPerSatfung[satfung] = [];
          belumPerSatfung[satfung].push(label);
          totalBelum++;
        }
      });

      const tipe = filter2 === "belum" ? "belum" : "sudah";
      let msg =
        headerLaporan +
        `📋 Rekap Akumulasi Likes IG\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
        `*Jumlah Konten:* ${totalKonten}\n` +
        `*Daftar link konten hari ini:*\n${kontenLinks.join("\n")}\n\n` +
        `*Jumlah user:* ${users.length}\n` +
        `✅ Sudah melaksanakan: *${totalSudah}*\n` +
        `❌ Belum melaksanakan: *${totalBelum}*\n\n`;

      // Filter output sudah/belum sesuai tipe request
      if (tipe === "sudah") {
        msg += `✅ Sudah melaksanakan (${totalSudah} user):\n`;
        Object.keys(sudahPerSatfung).forEach((satfung) => {
          const arr = sudahPerSatfung[satfung];
          msg += `*${satfung}* (${arr.length} user):\n`;
          arr.forEach((line) => {
            msg += `- ${line}\n`;
          });
          msg += "\n";
        });
      } else {
        msg += `❌ Belum melaksanakan (${totalBelum} user):\n`;
        Object.keys(belumPerSatfung).forEach((satfung) => {
          const arr = belumPerSatfung[satfung];
          msg += `*${satfung}* (${arr.length} user):\n`;
          arr.forEach((line) => {
            msg += `- ${line}\n`;
          });
          msg += "\n";
        });
      }

      await waClient.sendMessage(chatId, msg.trim());
      return;
    }

    // 5. === Mode per Konten (default/sudah/belum) ===
    for (const shortcode of shortcodes) {
      const likes = await getLikesByShortcode(shortcode);
      const likesSet = new Set(likes.map((l) => (l || "").toLowerCase()));
      const sudahPerSatfung = {};
      const belumPerSatfung = {};
      let totalSudah = 0,
        totalBelum = 0;

      users.forEach((u) => {
        const satfung = u.divisi || "-";
        const nama = [u.title, u.nama].filter(Boolean).join(" ");
        if (
          u.insta &&
          u.insta.trim() !== "" &&
          likesSet.has(u.insta.toLowerCase())
        ) {
          if (!sudahPerSatfung[satfung]) sudahPerSatfung[satfung] = [];
          sudahPerSatfung[satfung].push(`${nama} : ${u.insta}`);
          totalSudah++;
        } else {
          if (!belumPerSatfung[satfung]) belumPerSatfung[satfung] = [];
          const label =
            u.insta && u.insta.trim() !== ""
              ? `${nama} : ${u.insta}`
              : `${nama} : belum mengisi data insta`;
          belumPerSatfung[satfung].push(label);
          totalBelum++;
        }
      });

      const linkIG = `https://www.instagram.com/p/${shortcode}`;

      // Template pesan
      let msg =
        headerLaporan +
        `📋 Absensi Likes IG\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
        `*Jumlah Konten:* 1\n` +
        `*Daftar link konten hari ini:*\n${linkIG}\n\n` +
        `*Jumlah user:* ${users.length}\n` +
        `✅ Sudah melaksanakan: *${totalSudah}*\n` +
        `❌ Belum melaksanakan: *${totalBelum}*\n\n`;

      if (!filter1) {
        msg += `✅ Sudah melaksanakan (${totalSudah} user):\n`;
        Object.keys(sudahPerSatfung).forEach((satfung) => {
          const arr = sudahPerSatfung[satfung];
          msg += `*${satfung}* (${arr.length} user):\n`;
          arr.forEach((line) => {
            msg += `- ${line}\n`;
          });
          msg += "\n";
        });
        msg += `\n❌ Belum melaksanakan (${totalBelum} user):\n`;
        Object.keys(belumPerSatfung).forEach((satfung) => {
          const arr = belumPerSatfung[satfung];
          msg += `*${satfung}* (${arr.length} user):\n`;
          arr.forEach((line) => {
            msg += `- ${line}\n`;
          });
          msg += "\n";
        });
        await waClient.sendMessage(chatId, msg.trim());
        continue; // proses ke konten berikutnya
      }

      if (filter1 === "sudah") {
        let msgSudah = msg + `✅ Sudah melaksanakan (${totalSudah} user):\n`;
        Object.keys(sudahPerSatfung).forEach((satfung) => {
          const arr = sudahPerSatfung[satfung];
          msgSudah += `*${satfung}* (${arr.length} user):\n`;
          arr.forEach((line) => {
            msgSudah += `- ${line}\n`;
          });
          msgSudah += "\n";
        });
        await waClient.sendMessage(chatId, msgSudah.trim());
        continue;
      }

      if (filter1 === "belum") {
        let msgBelum = msg + `❌ Belum melaksanakan (${totalBelum} user):\n`;
        Object.keys(belumPerSatfung).forEach((satfung) => {
          const arr = belumPerSatfung[satfung];
          msgBelum += `*${satfung}* (${arr.length} user):\n`;
          arr.forEach((line) => {
            msgBelum += `- ${line}\n`;
          });
          msgBelum += "\n";
        });
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
    if (!isAdminWhatsApp(chatId)) {
      await waClient.sendMessage(chatId, "Akses ditolak.");
      return;
    }
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
    if (!isAdminWhatsApp(chatId)) {
      await waClient.sendMessage(
        chatId,
        "❌ Anda tidak memiliki akses ke sistem ini."
      );
      return;
    }
    const [, client_id] = text.split("#");
    if (!client_id) {
      await waClient.sendMessage(
        chatId,
        "Format salah!\nGunakan: fetchtiktok#clientid"
      );
      return;
    }

    await waClient.sendMessage(
      chatId,
      `⏳ Memulai fetch TikTok & komentar untuk *${client_id}* ...`
    );

    try {
      // 1. Fetch seluruh post TikTok hari ini dan update secUid jika perlu
      const posts = await fetchAndStoreTiktokContent(client_id);
      if (!posts || posts.length === 0) {
        await waClient.sendMessage(
          chatId,
          `Tidak ada post TikTok hari ini untuk client *${client_id}*.`
        );
        return;
      }

      // 2. Untuk setiap video, fetch & simpan semua komentar (paginasi semua halaman)
      let totalCommented = 0,
        totalVideos = 0;
      let rekap = [];
      for (const post of posts) {
        // fetchAllTikTokCommentsToday otomatis handle paginasi untuk 1 video_id
        const komentarData = await fetchAllTikTokCommentsToday(
          client_id,
          post.video_id
        );
        const count = Array.isArray(komentarData) ? komentarData.length : 0;
        totalCommented += count;
        totalVideos++;
        rekap.push({
          video_id: post.video_id,
          desc: post.desc,
          digg_count: post.digg_count,
          comment_count: count,
          url: `https://www.tiktok.com/@${post.unique_id}/video/${post.video_id}`,
        });
      }

      // 3. Format & kirim rekap ke WhatsApp
      let msg = `*Rekap TikTok Hari Ini*\nClient: *${client_id}*\n\n`;
      msg += `Jumlah video: *${totalVideos}*\nTotal komentar tersimpan: *${totalCommented}*\n\n`;
      rekap.forEach((item, i) => {
        msg += `#${i + 1} Video: ${item.video_id}\n`;
        msg += `   Deskripsi: ${item.desc?.slice(0, 50) || "-"}\n`;
        msg += `   Like: ${item.digg_count || 0} | Komentar: ${
          item.comment_count
        }\n`;
        msg += `   Link: ${item.url}\n\n`;
      });

      await waClient.sendMessage(chatId, msg.trim());
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal fetch TikTok: ${err.message}`
      );
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
  if (text.toLowerCase() === "clientrequest") {
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
    📝 *Client Request Commands:*
    1. *addnewclient#clientid#clientname*
        - Tambah data client baru.
    2. *updateclient#clientid#key#value*
        - Update data client berdasarkan key.
    3. *removeclient#clientid*
        - Hapus data client.
    4. *clientinfo#clientid*
        - Lihat detail data client.
    5. *clientrequest*
        - Tampilkan daftar perintah ini.
    6. *transferuser#clientid*
        - Migrasi seluruh data user (dari folder user_data/clientid) ke database (khusus admin/akses tertentu).

    *Key yang dapat digunakan pada updateclient#:*
    ${updateKeys.map((k) => `- *${k}*`).join("\n")}

    Contoh update:
    updateclient#BOJONEGORO#client_status#true
    updateclient#BOJONEGORO#client_insta_status#false
    updateclient#BOJONEGORO#client_operator#628123456789
    updateclient#BOJONEGORO#client_super#6281234567890
    updateclient#BOJONEGORO#client_tiktok#bjn_tiktok
    updateclient#BOJONEGORO#tiktok_secUid

    _Catatan: Value untuk key boolean gunakan true/false, untuk username TikTok dan Instagram cukup string._
        `;
    await waClient.sendMessage(chatId, menu);
    return;
  }

  if (text.toLowerCase() === "userrequest") {
    const menu = `
    📝 *User Request Commands:*

    1. *mydata#NRP/NIP*
    - Melihat data user Anda sendiri (dengan penamaan sesuai POLRI: NRP/NIP, pangkat, satfung, jabatan, status).
    - Hanya dapat diakses oleh nomor WhatsApp yang terdaftar (otomatis bind jika masih kosong).

    2. *updateuser#NRP/NIP#field#value*
    - Mengubah data user.
    - Field yang bisa diubah (hanya untuk user sendiri):
        - *nama*           : update nama user.
        - *pangkat*        : update pangkat (hanya bisa pilih dari list yang valid di database).
        - *satfung*        : update satfung (hanya bisa pilih dari list yang valid di database & POLRES yang sama).
        - *jabatan*        : update jabatan.
        - *insta*          : update/isi profil Instagram, format: https://www.instagram.com/username
        - *tiktok*         : update/isi profil TikTok, format: https://www.tiktok.com/@username
        - *whatsapp*       : binding atau update nomor WhatsApp user (hanya satu user per nomor WA, otomatis bind jika null).
    - Contoh:
        - updateuser#75070206#pangkat#AKP
        - updateuser#75070206#satfung#BAGOPS
        - updateuser#75070206#jabatan#KABAGOPS
        - updateuser#75070206#insta#https://www.instagram.com/edi.suyono
        - updateuser#75070206#tiktok#https://www.tiktok.com/@edisuyono
        - updateuser#75070206#whatsapp#6281234567890

    *Catatan:*
    - Untuk update pangkat atau satfung hanya bisa memilih dari list yang valid. Jika salah akan dikirimkan daftar yang bisa digunakan.
    - Nomor WhatsApp hanya boleh digunakan pada satu user (tidak bisa dipakai di dua user berbeda).
    - Untuk update profil Instagram/TikTok, masukkan *link profil* (sistem otomatis mengambil username dari link).
    - Semua perubahan hanya bisa dilakukan oleh user dengan nomor WhatsApp yang sudah terdaftar pada user tersebut. Jika nomor WA masih kosong, akan otomatis bind ke nomor pengirim pertama.

    3. *userrequest*
    - Menampilkan menu bantuan user ini.

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
      "nama",
      "title",
      "pangkat",
      "divisi",
      "satfung",
      "jabatan",
      "insta",
      "tiktok",
      "whatsapp",
    ];
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

      // Jika whatsapp sudah ada, hanya nomor ini yang bisa akses
      if (user.whatsapp !== pengirim) {
        await waClient.sendMessage(
          chatId,
          "❌ Hanya WhatsApp yang terdaftar pada user ini yang dapat mengakses data."
        );
        return;
      }

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
  if (
    text.toLowerCase().startsWith("exception#") ||
    text.toLowerCase().startsWith("status#")
  ) {
    // Hanya admin dari .env
    if (!isAdminWhatsApp(chatId)) {
      await waClient.sendMessage(
        chatId,
        "❌ Hanya admin yang dapat mengubah data status/exception."
      );
      return;
    }
    // Format: exception#user_id#true/false  atau status#user_id#true/false
    const [command, user_id, valueRaw] = text.split("#");
    if (!user_id || (valueRaw !== "true" && valueRaw !== "false")) {
      await waClient.sendMessage(
        chatId,
        `Format salah!\nGunakan: ${command}#user_id#true/false`
      );
      return;
    }
    const field = command.toLowerCase();
    try {
      // Cek user ada?
      const user = await userService.findUserById(user_id);
      if (!user) {
        await waClient.sendMessage(
          chatId,
          `❌ User dengan ID ${user_id} tidak ditemukan.`
        );
        return;
      }
      // Update
      await userService.updateUserField(user_id, field, valueRaw === "true");
      await waClient.sendMessage(
        chatId,
        `✅ Data *${field}* untuk user ${user_id} berhasil diupdate ke: *${
          valueRaw === "true" ? "true" : "false"
        }*`
      );
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal update ${field}: ${err.message}`
      );
    }
    return;
  }
}); // END waClient.on('message', ...)

// =======================
// INISIALISASI WA CLIENT
// =======================
waClient.initialize();

export default waClient;
