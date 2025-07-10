// src/handler/menu/oprRequestHandlers.js
import { isAdminWhatsApp } from "../../utils/waHelper.js";

export const oprRequestHandlers = {
  main: async (session, chatId, text, waClient, pool, userModel) => {
    let msg =
      `┏━━━ *MENU OPERATOR CICERO* ━━━┓
👮‍♂️  Hanya untuk operator client.
  
1️⃣ Tambah user baru
2️⃣ Ubah status user (aktif/nonaktif)
3️⃣ Cek data user (NRP/NIP)
4️⃣ Rekap link harian
5️⃣ Update Tugas

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
      session.step = "updateStatus_nrp";
      await waClient.sendMessage(
        chatId,
        "🟢🔴 *Ubah Status User*\nMasukkan NRP/NIP user yang ingin diubah statusnya:"
      );
      return;
    }
    if (/^3$/i.test(text.trim())) {
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
    if (/^4$/i.test(text.trim())) {
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
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.menu = null;
      session.step = null;
      clean();
      await waClient.sendMessage(chatId, "❎ Keluar dari menu operator.");
      return;
    }
    await waClient.sendMessage(
      chatId,
      "❗ Menu tidak dikenali. Pilih *1-5* atau ketik *batal* untuk keluar."
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
      await waClient.sendMessage(chatId, "❌ NRP/NIP tidak valid. Masukkan ulang atau ketik *batal*.");
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
    // List satfung
    const satfung = await userModel.getAvailableSatfung();
    const sorted = sortDivisionKeys(satfung);
    let msg = "*Pilih Satfung* (ketik nama persis sesuai daftar):\n";
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
    if (/^\d+$/.test(satfung)) {
      let msg = "❌ Satfung harus diisi sesuai daftar, gunakan nama pada daftar:\n";
      msg += satfungList.map((s, i) => ` ${i + 1}. ${s}`).join("\n");
      await waClient.sendMessage(chatId, msg);
      return;
    }
    if (!satfungList.map((s) => s.toUpperCase()).includes(satfung)) {
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
      await waClient.sendMessage(chatId, `❌ User dengan NRP/NIP *${nrp}* tidak ditemukan.`);
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
      } catch (e) {}
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
    let msg = `*Link Tugas Instagram* (${shortcodes.length} post hari ini)\n`;
    msg += `Jumlah user melaksanakan: *${users.size}*\n`;
    msg += `Jumlah link total: *${totalLinks}*\n\n`;
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

  updateTugas: async (session, chatId, text, waClient, pool, userModel) => {
    let clientId = session.selected_client_id || null;
    if (!clientId) {
      const waNum = chatId.replace(/[^0-9]/g, "");
      const q = "SELECT client_id FROM clients WHERE client_operator=$1 LIMIT 1";
      try {
        const res = await pool.query(q, [waNum]);
        clientId = res.rows[0]?.client_id || null;
      } catch (e) {}
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
      } catch (e) {}
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
      await waClient.sendMessage(chatId, `❌ User dengan NRP/NIP *${nrp}* tidak ditemukan.`);
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
