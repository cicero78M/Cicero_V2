// src/handler/menu/oprRequestHandlers.js
import { isAdminWhatsApp } from "../../utils/waHelper.js";
import { hariIndo } from "../../utils/constants.js";
import {
  getGreeting,
  sortDivisionKeys,
  sortTitleKeys,
} from "../../utils/utilsHelper.js";

function ignore(..._args) {}

function formatUpdateFieldList() {
  return `
✏️ *Pilih field yang ingin diupdate:*
1. Nama
2. Pangkat
3. Satfung
4. Jabatan
5. WhatsApp
6. Instagram
7. TikTok
8. Hapus WhatsApp

Balas angka field di atas atau *batal* untuk keluar.`.trim();
}

export const oprRequestHandlers = {
 main: async (session, chatId, text, waClient, pool, userModel) => {
    let msg =
      `┏━━━ *MENU OPERATOR CICERO* ━━━┓
👮‍♂️  Hanya untuk operator client.

1️⃣ Tambah user baru
2️⃣ Update data user
3️⃣ Ubah status user (aktif/nonaktif)
4️⃣ Cek data user (NRP/NIP)
5️⃣ Update Tugas
6️⃣ Rekap link harian
7️⃣ Rekap link per post
8️⃣ Absensi Amplifikasi User
9️⃣ Absensi Registrasi User

Ketik *angka menu* di atas, atau *batal* untuk keluar.
┗━━━━━━━━━━━━━━━━━━━━━━━━━┛`;
    session.step = "chooseMenu";
    await waClient.sendMessage(chatId, msg);
  },

  chooseMenu: async (session, chatId, text, waClient, pool, userModel) => {
    const clean = () => {
      delete session.addUser;
      delete session.availableSatfung;
      delete session.updateStatusNRP;
      session.step = "main";
    };
    if (/^1$/i.test(text.trim())) {
      clean();
      session.step = "addUser_nrp";
      await waClient.sendMessage(
        chatId,
        "➕ *Tambah User Baru*\nMasukkan NRP/NIP (belum terdaftar):"
      );
      return;
    }
    if (/^2$/i.test(text.trim())) {
      clean();
      session.step = "updateData_nrp";
      await waClient.sendMessage(
        chatId,
        "✏️ *Update Data User*\nMasukkan NRP/NIP user yang ingin diupdate:"
      );
      return;
    }
    if (/^3$/i.test(text.trim())) {
      clean();
      session.step = "updateStatus_nrp";
      await waClient.sendMessage(
        chatId,
        "🟢🔴 *Ubah Status User*\nMasukkan NRP/NIP user yang ingin diubah statusnya:"
      );
      return;
    }
    if (/^4$/i.test(text.trim())) {
      clean();
      if (isAdminWhatsApp(chatId)) {
        session.step = "cekUser_chooseClient";
        return oprRequestHandlers.cekUser_chooseClient(
          session,
          chatId,
          text,
          waClient,
          pool,
          userModel
        );
      }
      session.step = "cekUser_nrp";
      await waClient.sendMessage(
        chatId,
        "🔍 *Cek Data User*\nMasukkan NRP/NIP user yang ingin dicek:"
      );
      return;
    }
    if (/^5$/i.test(text.trim())) {
      clean();
      if (isAdminWhatsApp(chatId)) {
        session.step = "updateTugas_chooseClient";
        return oprRequestHandlers.updateTugas_chooseClient(
          session,
          chatId,
          text,
          waClient,
          pool,
          userModel
        );
      }
      session.step = "updateTugas";
      return oprRequestHandlers.updateTugas(session, chatId, text, waClient, pool, userModel);
    }
    if (/^6$/i.test(text.trim())) {
      clean();
      if (isAdminWhatsApp(chatId)) {
        session.step = "rekapLink_chooseClient";
        return oprRequestHandlers.rekapLink_chooseClient(
          session,
          chatId,
          text,
          waClient,
          pool,
          userModel
        );
      }
      session.step = "rekapLink";
      return oprRequestHandlers.rekapLink(session, chatId, text, waClient, pool, userModel);
    }
    if (/^7$/i.test(text.trim())) {
      clean();
      if (isAdminWhatsApp(chatId)) {
        session.step = "rekapLinkPerPost_chooseClient";
        return oprRequestHandlers.rekapLinkPerPost_chooseClient(
          session,
          chatId,
          text,
          waClient,
          pool
        );
      }
      session.step = "rekapLinkPerPost";
      return oprRequestHandlers.rekapLinkPerPost(session, chatId, text, waClient, pool, userModel);
    }
    if (/^8$/i.test(text.trim())) {
      clean();
      if (isAdminWhatsApp(chatId)) {
        session.step = "absensiLink_chooseClient";
        return oprRequestHandlers.absensiLink_chooseClient(
          session,
          chatId,
          text,
          waClient,
          pool
        );
      }
      session.step = "absensiLink_submenu";
      session.absensi_client_id = null;
      return oprRequestHandlers.absensiLink_submenu(session, chatId, text, waClient, pool, userModel);
    }
    if (/^9$/i.test(text.trim())) {
      clean();
      if (isAdminWhatsApp(chatId)) {
        session.step = "absensiReg_chooseClient";
        return oprRequestHandlers.absensiReg_chooseClient(
          session,
          chatId,
          text,
          waClient,
          pool
        );
      }
      session.step = "absensiReg_submenu";
      session.absensi_reg_client_id = null;
      return oprRequestHandlers.absensiReg_submenu(session, chatId, text, waClient, pool, userModel);
    }
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.menu = null;
      session.step = null;
      clean();
      await waClient.sendMessage(chatId, "❎ Keluar dari menu operator.");
      return;
    }
    await waClient.sendMessage(
      chatId,
      "Menu tidak dikenal. Balas angka 1-9 atau ketik *batal* untuk keluar."
    );
  },

  // ==== TAMBAH USER ====
  addUser_nrp: async (session, chatId, text, waClient, pool, userModel) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "🚫 Keluar dari proses tambah user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    const nrp = text.trim().replace(/[^0-9a-zA-Z]/g, "");
    if (!nrp) {
      await waClient.sendMessage(chatId, "❌ NRP yang Anda masukkan tidak valid. Silakan masukkan ulang atau ketik *batal*.");
      return;
    }
    const existing = await userModel.findUserById(nrp);
    if (existing) {
      let msg = `⚠️ NRP/NIP *${nrp}* sudah terdaftar:\n`;
      msg += `  • Nama: *${existing.nama || "-"}*\n  • Pangkat: *${existing.title || "-"}*\n  • Satfung: *${existing.divisi || "-"}*\n  • Jabatan: *${existing.jabatan || "-"}*\n  • Status: ${existing.status ? "🟢 AKTIF" : "🔴 NONAKTIF"}\n`;
      await waClient.sendMessage(chatId, msg + "\nTidak bisa menambahkan user baru dengan NRP/NIP ini.");
      session.step = "main";
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    session.addUser = { user_id: nrp };
    session.step = "addUser_nama";
    await waClient.sendMessage(chatId, "Masukkan *Nama Lengkap* (huruf kapital):");
  },

  addUser_nama: async (session, chatId, text, waClient, pool, userModel) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "🚫 Keluar dari proses tambah user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    const nama = text.trim().toUpperCase();
    if (!nama) {
      await waClient.sendMessage(chatId, "❗ Nama tidak boleh kosong. Masukkan ulang:");
      return;
    }
    session.addUser.nama = nama;
    session.step = "addUser_pangkat";
    await waClient.sendMessage(chatId, "Masukkan *Pangkat* (huruf kapital, misal: BRIPKA):");
  },

  addUser_pangkat: async (session, chatId, text, waClient, pool, userModel) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "🚫 Keluar dari proses tambah user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    const pangkat = text.trim().toUpperCase();
    if (!pangkat) {
      await waClient.sendMessage(chatId, "❗ Pangkat tidak boleh kosong. Masukkan ulang:");
      return;
    }
    session.addUser.title = pangkat;
    session.step = "addUser_satfung";
    // List satfung khusus client ini
    let clientId = null;
    try {
      const waNum = chatId.replace(/[^0-9]/g, "");
      const q = "SELECT client_id FROM clients WHERE client_operator=$1 LIMIT 1";
      const res = await pool.query(q, [waNum]);
      clientId = res.rows[0]?.client_id || null;
    } catch (e) { console.error(e); }
    if (!clientId) {
      await waClient.sendMessage(chatId, "❌ Client tidak ditemukan untuk nomor ini.");
      session.step = "main";
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    session.addUser.client_id = clientId;
    const satfung = await userModel.getAvailableSatfung(clientId);
    const sorted = sortDivisionKeys(satfung);
    let msg = "*Pilih Satfung* (ketik nomor atau nama sesuai daftar):\n";
    msg += sorted.map((s, i) => ` ${i + 1}. ${s}`).join("\n");
    session.availableSatfung = sorted;
    await waClient.sendMessage(chatId, msg);
  },

  addUser_satfung: async (session, chatId, text, waClient, pool, userModel) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "🚫 Keluar dari proses tambah user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    const satfungList = session.availableSatfung || [];
    let satfung = text.trim().toUpperCase();
    const upperList = satfungList.map((s) => s.toUpperCase());
    if (/^\d+$/.test(satfung)) {
      const idx = parseInt(satfung, 10) - 1;
      if (idx >= 0 && idx < satfungList.length) {
        satfung = satfungList[idx];
      } else {
        let msg = "❌ Satfung tidak valid! Pilih sesuai daftar:\n";
        msg += satfungList.map((s, i) => ` ${i + 1}. ${s}`).join("\n");
        await waClient.sendMessage(chatId, msg);
        return;
      }
    } else if (!upperList.includes(satfung)) {
      let msg = "❌ Satfung tidak valid! Pilih sesuai daftar:\n";
      msg += satfungList.map((s, i) => ` ${i + 1}. ${s}`).join("\n");
      await waClient.sendMessage(chatId, msg);
      return;
    }
    session.addUser.divisi = satfung;
    session.step = "addUser_jabatan";
    await waClient.sendMessage(chatId, "Masukkan *Jabatan* (huruf kapital, contoh: BAURMIN):");
  },

  addUser_jabatan: async (session, chatId, text, waClient, pool, userModel) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "🚫 Keluar dari proses tambah user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    const jabatan = text.trim().toUpperCase();
    if (!jabatan) {
      await waClient.sendMessage(chatId, "❗ Jabatan tidak boleh kosong. Masukkan ulang:");
      return;
    }
    session.addUser.jabatan = jabatan;
    session.addUser.status = true;
    session.addUser.exception = false;

    // Simpan ke DB
    try {
      await userModel.createUser(session.addUser);
      await waClient.sendMessage(
        chatId,
        `✅ *User baru berhasil ditambahkan:*\n━━━━━━━━━━━━━━━━━━━━━━
*NRP*: ${session.addUser.user_id}
*Nama*: ${session.addUser.nama}
*Pangkat*: ${session.addUser.title}
*Satfung*: ${session.addUser.divisi}
*Jabatan*: ${session.addUser.jabatan}
Status: 🟢 AKTIF, Exception: False
━━━━━━━━━━━━━━━━━━━━━━`
      );
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal menambahkan user: ${err.message}`);
    }
    session.step = "main";
    return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
  },

  // ==== UPDATE STATUS USER ====
  updateStatus_nrp: async (session, chatId, text, waClient, pool, userModel) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "Keluar dari proses ubah status user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    const nrp = text.trim().replace(/[^0-9a-zA-Z]/g, "");
    const user = await userModel.findUserById(nrp);
    if (!user) {
      await waClient.sendMessage(chatId, `❌ User dengan NRP/NIP *${nrp}* tidak ditemukan. Hubungi Opr Humas Polres Anda.`);
      session.step = "main";
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    let statusStr = user.status ? "🟢 *AKTIF*" : "🔴 *NONAKTIF*";
    let msg = `
━━━━━━━━━━━━━━━━━━━━━━
👤 *Data User* ━━━━━━━━━━

*NRP/NIP*   : ${user.user_id}
*Nama*      : ${user.nama || "-"}
*Pangkat*   : ${user.title || "-"}
*Satfung*   : ${user.divisi || "-"}
*Jabatan*   : ${user.jabatan || "-"}
*Status*    : ${statusStr}
━━━━━━━━━━━━━━━━━━━━━━

Status baru yang akan di-set:
1. 🟢 *AKTIF*
2. 🔴 *NONAKTIF*

Balas *angka* (1/2) sesuai status baru, atau *batal* untuk keluar.
`.trim();

    session.updateStatusNRP = nrp;
    session.step = "updateStatus_value";
    await waClient.sendMessage(chatId, msg);
  },

  rekapLink: async (session, chatId, text, waClient, pool, userModel) => {
    let clientId = session.selected_client_id || null;
    if (!clientId) {
      const waNum = chatId.replace(/[^0-9]/g, "");
      const q = "SELECT client_id FROM clients WHERE client_operator=$1 LIMIT 1";
      try {
        const res = await pool.query(q, [waNum]);
        clientId = res.rows[0]?.client_id || null;
      } catch (e) { console.error(e); }
      if (isAdminWhatsApp(chatId) && !clientId) {
        session.step = "rekapLink_chooseClient";
        return oprRequestHandlers.rekapLink_chooseClient(session, chatId, text, waClient, pool);
      }
      if (!clientId) {
        await waClient.sendMessage(chatId, "❌ Client tidak ditemukan untuk nomor ini.");
        session.step = "main";
        return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
      }
    }
    const { getReportsTodayByClient } = await import("../../model/linkReportModel.js");
    const { getShortcodesTodayByClient } = await import("../../model/instaPostModel.js");
    const reports = await getReportsTodayByClient(clientId);
    if (!reports || reports.length === 0) {
      await waClient.sendMessage(chatId, `Tidak ada laporan link hari ini untuk client *${clientId}*.`);
      session.step = "main";
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    const shortcodes = await getShortcodesTodayByClient(clientId);
    const list = {
      facebook: [],
      instagram: [],
      twitter: [],
      tiktok: [],
      youtube: []
    };
    const users = new Set();
    reports.forEach((r) => {
      users.add(r.user_id);
      if (r.facebook_link) list.facebook.push(r.facebook_link);
      if (r.instagram_link) list.instagram.push(r.instagram_link);
      if (r.twitter_link) list.twitter.push(r.twitter_link);
      if (r.tiktok_link) list.tiktok.push(r.tiktok_link);
      if (r.youtube_link) list.youtube.push(r.youtube_link);
    });
    const totalLinks =
      list.facebook.length +
      list.instagram.length +
      list.twitter.length +
      list.tiktok.length +
      list.youtube.length;

    const now = new Date();
    const hari = hariIndo[now.getDay()];
    const tanggal = now.toLocaleDateString("id-ID");
    const jam = now.toLocaleTimeString("id-ID", { hour12: false });
    const salam = getGreeting();

    const { rows: nameRows } = await pool.query(
      "SELECT nama FROM clients WHERE client_id=$1 LIMIT 1",
      [clientId]
    );
    const clientName = nameRows[0]?.nama || clientId;

    const kontenLinks = shortcodes.map(
      sc => `https://www.instagram.com/p/${sc}`
    );

    let msg = `${salam}\n\n`;
    msg += `Mohon Ijin Melaporkan Pelaksanaan Tugas Amplifikasi *${clientName}* pada hari :\n`;
    msg += `Hari : ${hari}\n`;
    msg += `Tanggal : ${tanggal}\n`;
    msg += `Pukul : ${jam}\n\n`;

    msg += `Jumlah Konten Resmi Hari ini : ${shortcodes.length}\n`;
    if (kontenLinks.length > 0) {
      msg += `${kontenLinks.join("\n")}\n\n`;
    } else {
      msg += "-\n\n";
    }

    msg += `Jumlah Personil yang melaksnakan : ${users.size}\n`;
    msg += `Jumlah Total Link dari 5 Platform Sosial Media : ${totalLinks}\n\n`;

    msg += `Link Sebagai Berikut :\n`;
    msg += `Facebook (${list.facebook.length}):\n${list.facebook.join("\n") || "-"}`;
    msg += `\n\nInstagram (${list.instagram.length}):\n${list.instagram.join("\n") || "-"}`;
    msg += `\n\nTwitter (${list.twitter.length}):\n${list.twitter.join("\n") || "-"}`;
    msg += `\n\nTikTok (${list.tiktok.length}):\n${list.tiktok.join("\n") || "-"}`;
    msg += `\n\nYoutube (${list.youtube.length}):\n${list.youtube.join("\n") || "-"}`;
    await waClient.sendMessage(chatId, msg.trim());
    delete session.selected_client_id;
    session.step = "main";
    return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
  },

  rekapLinkPerPost: async (session, chatId, text, waClient, pool, userModel) => {
    let clientId = session.selected_client_id || null;
    if (!clientId) {
      const waNum = chatId.replace(/[^0-9]/g, "");
      const q = "SELECT client_id FROM clients WHERE client_operator=$1 LIMIT 1";
      try {
        const res = await pool.query(q, [waNum]);
        clientId = res.rows[0]?.client_id || null;
      } catch (e) { console.error(e); }
      if (isAdminWhatsApp(chatId) && !clientId) {
        session.step = "rekapLinkPerPost_chooseClient";
        return oprRequestHandlers.rekapLinkPerPost_chooseClient(
          session,
          chatId,
          text,
          waClient,
          pool
        );
      }
      if (!clientId) {
        await waClient.sendMessage(chatId, "❌ Client tidak ditemukan untuk nomor ini.");
        session.step = "main";
        return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
      }
    }
    const { getShortcodesTodayByClient } = await import("../../model/instaPostModel.js");
    const shortcodes = await getShortcodesTodayByClient(clientId);
    if (!shortcodes.length) {
      await waClient.sendMessage(chatId, `Tidak ada tugas link post hari ini untuk client *${clientId}*.`);
      session.step = "main";
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    session.rekapShortcodes = shortcodes;
    session.selected_client_id = clientId;
    let msg = `*Rekap Post List*\nBalas angka untuk pilih post:\n`;
    shortcodes.forEach((sc, i) => {
      msg += `${i + 1}. https://www.instagram.com/p/${sc}\n`;
    });
    session.step = "rekapLinkPerPost_action";
    await waClient.sendMessage(chatId, msg.trim());
  },

  rekapLinkPerPost_action: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const shortcodes = session.rekapShortcodes || [];
    if (isNaN(idx) || !shortcodes[idx]) {
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas angka sesuai daftar.");
      return;
    }
    const sc = shortcodes[idx];
    const clientId = session.selected_client_id;
    const { getReportsTodayByShortcode } = await import("../../model/linkReportModel.js");
    const reports = await getReportsTodayByShortcode(clientId, sc);
    if (!reports || reports.length === 0) {
      await waClient.sendMessage(chatId, `Belum ada laporan link untuk post tersebut.`);
      session.step = "main";
      delete session.rekapShortcodes;
      delete session.selected_client_id;
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    const list = {
      facebook: [],
      instagram: [],
      twitter: [],
      tiktok: [],
      youtube: []
    };
    const users = new Set();
    reports.forEach(r => {
      users.add(r.user_id);
      if (r.facebook_link) list.facebook.push(r.facebook_link);
      if (r.instagram_link) list.instagram.push(r.instagram_link);
      if (r.twitter_link) list.twitter.push(r.twitter_link);
      if (r.tiktok_link) list.tiktok.push(r.tiktok_link);
      if (r.youtube_link) list.youtube.push(r.youtube_link);
    });
    const totalLinks =
      list.facebook.length +
      list.instagram.length +
      list.twitter.length +
      list.tiktok.length +
      list.youtube.length;

    const now = new Date();
    const hari = hariIndo[now.getDay()];
    const tanggal = now.toLocaleDateString("id-ID");
    const jam = now.toLocaleTimeString("id-ID", { hour12: false });
    const salam = getGreeting();

    const { rows: nameRows } = await pool.query(
      "SELECT nama FROM clients WHERE client_id=$1 LIMIT 1",
      [clientId]
    );
    const clientName = nameRows[0]?.nama || clientId;

    let msg = `${salam}\n\n`;
    msg += `Mohon Ijin Melaporkan Pelaksanaan Tugas Amplifikasi *${clientName}* pada hari :\n`;
    msg += `Hari : ${hari}\n`;
    msg += `Tanggal : ${tanggal}\n`;
    msg += `Pukul : ${jam}\n\n`;
    msg += `Link Post: https://www.instagram.com/p/${sc}\n\n`;
    msg += `Jumlah Personil yang melaksnakan : ${users.size}\n`;
    msg += `Jumlah Total Link dari 5 Platform Sosial Media : ${totalLinks}\n\n`;

    msg += `Link Sebagai Berikut :\n`;
    msg += `Facebook (${list.facebook.length}):\n${list.facebook.join("\n") || "-"}`;
    msg += `\n\nInstagram (${list.instagram.length}):\n${list.instagram.join("\n") || "-"}`;
    msg += `\n\nTwitter (${list.twitter.length}):\n${list.twitter.join("\n") || "-"}`;
    msg += `\n\nTikTok (${list.tiktok.length}):\n${list.tiktok.join("\n") || "-"}`;
    msg += `\n\nYoutube (${list.youtube.length}):\n${list.youtube.join("\n") || "-"}`;
    await waClient.sendMessage(chatId, msg.trim());
    delete session.rekapShortcodes;
    delete session.selected_client_id;
    session.step = "main";
    return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
  },

  updateTugas: async (session, chatId, text, waClient, pool, userModel) => {
    let clientId = session.selected_client_id || null;
    if (!clientId) {
      const waNum = chatId.replace(/[^0-9]/g, "");
      const q = "SELECT client_id FROM clients WHERE client_operator=$1 LIMIT 1";
      try {
        const res = await pool.query(q, [waNum]);
        clientId = res.rows[0]?.client_id || null;
      } catch (e) { console.error(e); }
      if (isAdminWhatsApp(chatId) && !clientId) {
        session.step = "updateTugas_chooseClient";
        return oprRequestHandlers.updateTugas_chooseClient(session, chatId, text, waClient, pool);
      }
      if (!clientId) {
        await waClient.sendMessage(chatId, "❌ Client tidak ditemukan untuk nomor ini.");
        session.step = "main";
        return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
      }
    }
    const { fetchAndStoreInstaContent } = await import("../fetchpost/instaFetchPost.js");
    try {
      await fetchAndStoreInstaContent(null, waClient, chatId, clientId);
      await waClient.sendMessage(chatId, `✅ Update tugas selesai untuk client *${clientId}*.`);
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal update tugas IG: ${err.message}`);
    }
    session.step = "main";
    return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
  },

  updateStatus_value: async (session, chatId, text, waClient, pool, userModel) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "❎ Keluar dari proses update status user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    let status = null;
    if (text.trim() === "1") status = true;
    if (text.trim() === "2") status = false;
    if (status === null) {
      await waClient.sendMessage(chatId, "❗ Pilihan tidak valid. Balas 1 untuk *AKTIF* atau 2 untuk *NONAKTIF*.");
      return;
    }
    try {
      await userModel.updateUserField(session.updateStatusNRP, "status", status);
      const user = await userModel.findUserById(session.updateStatusNRP);
      let statusStr = status ? "🟢 *AKTIF*" : "🔴 *NONAKTIF*";
      let msg = `✅ *Status user berhasil diubah!*
━━━━━━━━━━━━━━━━━━━━━━
*NRP/NIP*   : ${user.user_id}
*Nama*      : ${user.nama || "-"}
*Status*    : ${statusStr}
━━━━━━━━━━━━━━━━━━━━━━`;
      await waClient.sendMessage(chatId, msg);
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal update status: ${err.message}`);
    }
    session.step = "main";
    return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
  },

  // ==== UPDATE DATA USER ====
  updateData_nrp: async (session, chatId, text, waClient, pool, userModel) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "❎ Keluar dari proses update data.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    const nrp = text.trim().replace(/[^0-9a-zA-Z]/g, "");
    const user = await userModel.findUserById(nrp);
    if (!user) {
      await waClient.sendMessage(chatId, `❌ User dengan NRP/NIP *${nrp}* tidak ditemukan.`);
      session.step = "main";
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    session.updateUserId = nrp;
    session.step = "updateData_chooseField";
    await waClient.sendMessage(chatId, formatUpdateFieldList());
  },

  updateData_chooseField: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    const allowedFields = [
      { key: "nama", label: "Nama" },
      { key: "pangkat", label: "Pangkat" },
      { key: "satfung", label: "Satfung" },
      { key: "jabatan", label: "Jabatan" },
      { key: "whatsapp", label: "WhatsApp" },
      { key: "insta", label: "Instagram" },
      { key: "tiktok", label: "TikTok" },
      { key: "hapus_whatsapp", label: "Hapus WhatsApp" },
    ];

    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "❎ Keluar dari proses update data.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }

    if (!/^[1-8]$/.test(text.trim())) {
      await waClient.sendMessage(chatId, formatUpdateFieldList());
      return;
    }

    const idx = parseInt(text.trim()) - 1;
    const field = allowedFields[idx].key;
    session.updateField = field;

    if (field === "hapus_whatsapp") {
      session.step = "updateData_confirmDeleteWa";
      await waClient.sendMessage(
        chatId,
        "⚠️ Apakah Anda yakin ingin *menghapus nomor WhatsApp* user ini? Balas *ya* untuk menghapus, *tidak* untuk membatalkan."
      );
      return;
    }

    if (field === "pangkat") {
      const titles = await userModel.getAvailableTitles();
      if (titles && titles.length) {
        const sorted = sortTitleKeys(titles, titles);
        let msgList = sorted.map((t, i) => `${i + 1}. ${t}`).join("\n");
        session.availableTitles = sorted;
        await waClient.sendMessage(chatId, "Daftar pangkat yang dapat dipilih:\n" + msgList);
      }
    }
    if (field === "satfung") {
      let clientId = null;
      try {
        const user = await userModel.findUserById(session.updateUserId);
        clientId = user?.client_id || null;
      } catch (e) { console.error(e); }
      const satfung = await userModel.getAvailableSatfung(clientId);
      if (satfung && satfung.length) {
        const sorted = sortDivisionKeys(satfung);
        let msgList = sorted.map((s, i) => `${i + 1}. ${s}`).join("\n");
        session.availableSatfung = sorted;
        await waClient.sendMessage(chatId, "Daftar satfung yang dapat dipilih:\n" + msgList);
      }
    }

    session.step = "updateData_value";
    let extra = "";
    if (field === "pangkat") extra = " (pilih dari daftar pangkat)";
    else if (field === "satfung") extra = " (pilih dari daftar satfung)";
    else if (field === "insta") extra = " (masukkan link profil Instagram)";
    else if (field === "tiktok") extra = " (masukkan link profil TikTok)";
    await waClient.sendMessage(
      chatId,
      `Ketik nilai baru untuk field *${allowedFields[idx].label}*${extra}:`
    );
  },

  updateData_confirmDeleteWa: async (session, chatId, text, waClient, pool, userModel) => {
    const ans = text.trim().toLowerCase();
    if (ans === "ya") {
      await userModel.updateUserField(session.updateUserId, "whatsapp", "");
      await waClient.sendMessage(
        chatId,
        `✅ Nomor WhatsApp untuk NRP ${session.updateUserId} berhasil dihapus.`
      );
      session.step = "main";
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    if (ans === "tidak") {
      session.step = "main";
      await waClient.sendMessage(chatId, "Dibatalkan. Nomor tidak dihapus.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    await waClient.sendMessage(chatId, "Balas *ya* untuk menghapus, *tidak* untuk membatalkan.");
  },

  updateData_value: async (session, chatId, text, waClient, pool, userModel) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "❎ Keluar dari proses update data.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    const user_id = session.updateUserId;
    let field = session.updateField;
    let value = text.trim();

    if (field === "pangkat") field = "title";
    if (field === "satfung") field = "divisi";

    if (field === "title") {
      const titles = session.availableTitles || (await userModel.getAvailableTitles());
      const normalizedTitles = titles.map((t) => t.toUpperCase());
      if (/^\d+$/.test(value)) {
        const idx = parseInt(value) - 1;
        if (idx >= 0 && idx < titles.length) {
          value = titles[idx];
        } else {
          const msgList = titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
          await waClient.sendMessage(chatId, `❌ Pangkat tidak valid! Pilih sesuai daftar:\n${msgList}`);
          return;
        }
      } else if (!normalizedTitles.includes(value.toUpperCase())) {
        const msgList = titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
        await waClient.sendMessage(chatId, `❌ Pangkat tidak valid! Pilih sesuai daftar:\n${msgList}`);
        return;
      }
    }
    if (field === "divisi") {
      let clientId = null;
      try {
        const user = await userModel.findUserById(session.updateUserId);
        clientId = user?.client_id || null;
      } catch (e) { console.error(e); }
      const satfungList = session.availableSatfung || (await userModel.getAvailableSatfung(clientId));
      const normalizedSatfung = satfungList.map((s) => s.toUpperCase());
      if (/^\d+$/.test(value)) {
        const idx = parseInt(value, 10) - 1;
        if (idx >= 0 && idx < satfungList.length) {
          value = satfungList[idx];
        } else {
          const msgList = satfungList.map((s, i) => `${i + 1}. ${s}`).join("\n");
          await waClient.sendMessage(chatId, `❌ Satfung tidak valid! Pilih sesuai daftar:\n${msgList}`);
          return;
        }
      } else if (!normalizedSatfung.includes(value.toUpperCase())) {
        const msgList = satfungList.map((s, i) => `${i + 1}. ${s}`).join("\n");
        await waClient.sendMessage(chatId, `❌ Satfung tidak valid! Pilih sesuai daftar:\n${msgList}`);
        return;
      }
    }
    if (field === "insta") {
      const igMatch = value.match(/^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]+)/i);
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
      const ttMatch = value.match(/^https?:\/\/(www\.)?tiktok\.com\/@([A-Za-z0-9._]+)/i);
      if (!ttMatch) {
        await waClient.sendMessage(
          chatId,
          "❌ Format salah! Masukkan *link profil TikTok* (contoh: https://www.tiktok.com/@username)"
        );
        return;
      }
      value = "@" + ttMatch[2];
    }
    if (field === "whatsapp") {
      value = value.replace(/[^0-9]/g, "");
      const operatorWa = chatId.replace(/[^0-9]/g, "");
      if (value === operatorWa) {
        await waClient.sendMessage(
          chatId,
          "❌ Nomor WhatsApp operator tidak boleh disimpan pada data user. Masukkan nomor lain."
        );
        return;
      }
    }
    if (["nama", "title", "divisi", "jabatan"].includes(field)) value = value.toUpperCase();

    try {
      await userModel.updateUserField(user_id, field, value);
      await waClient.sendMessage(
        chatId,
        `✅ Data *${field === "title" ? "pangkat" : field === "divisi" ? "satfung" : field}* untuk NRP ${user_id} berhasil diupdate menjadi *${value}*.`
      );
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal update data: ${err.message}`);
    }
    delete session.availableTitles;
    delete session.availableSatfung;
    session.step = "main";
    return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
  },

  // ===== ADMIN CHOOSE CLIENTS =====
  rekapLink_chooseClient: async (session, chatId, text, waClient, pool) => {
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
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "rekapLink_chooseClient_action";
  },

  rekapLink_chooseClient_action: async (
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
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas angka sesuai daftar.");
      return;
    }
    session.selected_client_id = clients[idx].client_id;
    session.step = "rekapLink";
    return oprRequestHandlers.rekapLink(session, chatId, "", waClient, pool, userModel);
  },

  rekapLinkPerPost_chooseClient: async (session, chatId, text, waClient, pool) => {
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
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "rekapLinkPerPost_chooseClient_action";
  },

  rekapLinkPerPost_chooseClient_action: async (
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
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas angka sesuai daftar.");
      return;
    }
    session.selected_client_id = clients[idx].client_id;
    session.step = "rekapLinkPerPost";
    return oprRequestHandlers.rekapLinkPerPost(session, chatId, "", waClient, pool, userModel);
  },

  updateTugas_chooseClient: async (session, chatId, text, waClient, pool) => {
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
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "updateTugas_chooseClient_action";
  },

  updateTugas_chooseClient_action: async (
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
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas angka sesuai daftar.");
      return;
    }
    session.selected_client_id = clients[idx].client_id;
    session.step = "updateTugas";
    return oprRequestHandlers.updateTugas(session, chatId, "", waClient, pool, userModel);
  },

  absensiLink_chooseClient: async (session, chatId, text, waClient, pool) => {
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
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "absensiLink_chooseClient_action";
  },

  absensiLink_chooseClient_action: async (
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
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas angka sesuai daftar.");
      return;
    }
    session.absensi_client_id = clients[idx].client_id;
    session.step = "absensiLink_submenu";
    return oprRequestHandlers.absensiLink_submenu(session, chatId, "", waClient, pool, userModel);
  },

  absensiLink_submenu: async (session, chatId, text, waClient, pool, userModel) => {
    let clientId = session.absensi_client_id || null;
    if (!clientId) {
      const waNum = chatId.replace(/[^0-9]/g, "");
      const q = "SELECT client_id FROM clients WHERE client_operator=$1 LIMIT 1";
      try {
        const res = await pool.query(q, [waNum]);
        clientId = res.rows[0]?.client_id || null;
      } catch (e) { console.error(e); }
      if (isAdminWhatsApp(chatId) && !clientId) {
        session.step = "absensiLink_chooseClient";
        return oprRequestHandlers.absensiLink_chooseClient(session, chatId, text, waClient, pool);
      }
      if (!clientId) {
        await waClient.sendMessage(chatId, "❌ Client tidak ditemukan untuk nomor ini.");
        session.step = "main";
        return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
      }
    }
    session.absensi_client_id = clientId;
    let msg = `Pilih tipe laporan absensi link:\n1. Semua\n2. Sudah\n3. Belum\nBalas angka di atas.`;
    await waClient.sendMessage(chatId, msg);
    session.step = "absensiLink_menu";
  },

  absensiLink_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    const pilihan = parseInt(text.trim());
    const clientId = session.absensi_client_id;
    if (!clientId) {
      await waClient.sendMessage(chatId, "Client belum dipilih.");
      session.step = "main";
      return;
    }
    try {
      const { absensiLink } = await import("../fetchabsensi/link/absensiLinkAmplifikasi.js");
      let mode = null;
      if (pilihan === 1) mode = "all";
      else if (pilihan === 2) mode = "sudah";
      else if (pilihan === 3) mode = "belum";
      else {
        await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas 1-3.");
        return;
      }
      const msg = await absensiLink(clientId, { mode });
      await waClient.sendMessage(chatId, msg || "Data tidak ditemukan.");
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
    return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
  },

  absensiReg_chooseClient: async (session, chatId, text, waClient, pool) => {
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
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "absensiReg_chooseClient_action";
  },

  absensiReg_chooseClient_action: async (
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
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas angka sesuai daftar.");
      return;
    }
    session.absensi_reg_client_id = clients[idx].client_id;
    session.step = "absensiReg_submenu";
    return oprRequestHandlers.absensiReg_submenu(session, chatId, "", waClient, pool, userModel);
  },

  absensiReg_submenu: async (session, chatId, text, waClient, pool, userModel) => {
    let clientId = session.absensi_reg_client_id || null;
    if (!clientId) {
      const waNum = chatId.replace(/[^0-9]/g, "");
      const q = "SELECT client_id FROM clients WHERE client_operator=$1 LIMIT 1";
      try {
        const res = await pool.query(q, [waNum]);
        clientId = res.rows[0]?.client_id || null;
      } catch (e) { console.error(e); }
      if (isAdminWhatsApp(chatId) && !clientId) {
        session.step = "absensiReg_chooseClient";
        return oprRequestHandlers.absensiReg_chooseClient(session, chatId, text, waClient, pool);
      }
      if (!clientId) {
        await waClient.sendMessage(chatId, "❌ Client tidak ditemukan untuk nomor ini.");
        session.step = "main";
        return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
      }
    }
    session.absensi_reg_client_id = clientId;
    let msg = `Pilih tipe laporan absensi registrasi:\n1. Semua\n2. Sudah\n3. Belum\nBalas angka di atas.`;
    await waClient.sendMessage(chatId, msg);
    session.step = "absensiReg_menu";
  },

  absensiReg_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    const pilihan = parseInt(text.trim());
    const clientId = session.absensi_reg_client_id;
    if (!clientId) {
      await waClient.sendMessage(chatId, "Client belum dipilih.");
      session.step = "main";
      return;
    }
    try {
      const { absensiRegistrasiWa } = await import("../fetchabsensi/wa/absensiRegistrasiWa.js");
      let mode = null;
      if (pilihan === 1) mode = "all";
      else if (pilihan === 2) mode = "sudah";
      else if (pilihan === 3) mode = "belum";
      else {
        await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas 1-3.");
        return;
      }
      const msg = await absensiRegistrasiWa(clientId, { mode });
      await waClient.sendMessage(chatId, msg || "Data tidak ditemukan.");
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
    return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
  },

  cekUser_chooseClient: async (session, chatId, text, waClient, pool) => {
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
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "cekUser_chooseClient_action";
  },

  cekUser_chooseClient_action: async (
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
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas angka sesuai daftar.");
      return;
    }
    session.selected_client_id = clients[idx].client_id;
    session.step = "cekUser_nrp";
    await waClient.sendMessage(
      chatId,
      "🔍 *Cek Data User*\nMasukkan NRP/NIP user yang ingin dicek:"
    );
  },

  // ==== CEK DATA USER ====
  cekUser_nrp: async (session, chatId, text, waClient, pool, userModel) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "Keluar dari proses cek user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
    }
    const nrp = text.trim().replace(/[^0-9a-zA-Z]/g, "");
    let clientId = session.selected_client_id || null;
    if (!clientId) {
      const waNum = chatId.replace(/[^0-9]/g, "");
      const q = "SELECT client_id FROM clients WHERE client_operator=$1 LIMIT 1";
      try {
        const res = await pool.query(q, [waNum]);
        clientId = res.rows[0]?.client_id || null;
      } catch (e) { console.error(e); }
      if (isAdminWhatsApp(chatId) && !clientId) {
        session.step = "cekUser_chooseClient";
        return oprRequestHandlers.cekUser_chooseClient(session, chatId, text, waClient, pool);
      }
      if (!clientId) {
        await waClient.sendMessage(chatId, "❌ Client tidak ditemukan untuk nomor ini.");
        session.step = "main";
        return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
      }
    }

    const user = await userModel.findUserByIdAndClient(nrp, clientId);
    if (!user) {
      await waClient.sendMessage(chatId, `❌ User dengan NRP/NIP *${nrp}* tidak ditemukan. Hubungi Opr Humas Polres Anda.`);
    } else {
      let statusStr = user.status ? "🟢 *AKTIF*" : "🔴 *NONAKTIF*";
      let msg = `
━━━━━━━━━━━━━━━━━━━━━━
👤 *Data User* ━━━━━━━━━━

*NRP/NIP*   : ${user.user_id}
*Nama*      : ${user.nama || "-"}
*Pangkat*   : ${user.title || "-"}
*Satfung*   : ${user.divisi || "-"}
*Jabatan*   : ${user.jabatan || "-"}
*Status*    : ${statusStr}
━━━━━━━━━━━━━━━━━━━━━━
`.trim();
      await waClient.sendMessage(chatId, msg);
    }
    delete session.selected_client_id;
    session.step = "main";
    return oprRequestHandlers.main(session, chatId, "", waClient, pool, userModel);
  },
};

export default oprRequestHandlers;
