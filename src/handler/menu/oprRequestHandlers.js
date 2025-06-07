// src/handler/menu/oprRequestHandlers.js

export const oprRequestHandlers = {
  main: async (session, chatId, text, waClient, pool, userService) => {
    let msg =
      `┏━━━ *MENU OPERATOR CICERO* ━━━┓
👮‍♂️  Hanya untuk operator client.
  
1️⃣ Tambah user baru
2️⃣ Ubah status user (aktif/nonaktif)
3️⃣ Cek data user (NRP/NIP)

Ketik *angka menu* di atas, atau *batal* untuk keluar.
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;
    session.step = "chooseMenu";
    await waClient.sendMessage(chatId, msg);
  },

  chooseMenu: async (session, chatId, text, waClient, pool, userService) => {
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
      session.step = "cekUser_nrp";
      await waClient.sendMessage(
        chatId,
        "🔍 *Cek Data User*\nMasukkan NRP/NIP user yang ingin dicek:"
      );
      return;
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
      "❗ Menu tidak dikenali. Pilih *1, 2,* atau *3*, atau ketik *batal* untuk keluar."
    );
  },

  // ==== TAMBAH USER ====
  addUser_nrp: async (session, chatId, text, waClient, pool, userService) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "🚫 Keluar dari proses tambah user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userService);
    }
    const nrp = text.trim().replace(/[^0-9a-zA-Z]/g, "");
    if (!nrp) {
      await waClient.sendMessage(chatId, "❌ NRP/NIP tidak valid. Masukkan ulang atau ketik *batal*.");
      return;
    }
    const existing = await userService.findUserById(nrp);
    if (existing) {
      let msg = `⚠️ NRP/NIP *${nrp}* sudah terdaftar:\n`;
      msg += `  • Nama: *${existing.nama || "-"}*\n  • Pangkat: *${existing.title || "-"}*\n  • Satfung: *${existing.divisi || "-"}*\n  • Jabatan: *${existing.jabatan || "-"}*\n  • Status: ${existing.status ? "🟢 AKTIF" : "🔴 NONAKTIF"}\n`;
      await waClient.sendMessage(chatId, msg + "\nTidak bisa menambahkan user baru dengan NRP/NIP ini.");
      session.step = "main";
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userService);
    }
    session.addUser = { user_id: nrp };
    session.step = "addUser_nama";
    await waClient.sendMessage(chatId, "Masukkan *Nama Lengkap* (huruf kapital):");
  },

  addUser_nama: async (session, chatId, text, waClient, pool, userService) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "🚫 Keluar dari proses tambah user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userService);
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

  addUser_pangkat: async (session, chatId, text, waClient, pool, userService) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "🚫 Keluar dari proses tambah user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userService);
    }
    const pangkat = text.trim().toUpperCase();
    if (!pangkat) {
      await waClient.sendMessage(chatId, "❗ Pangkat tidak boleh kosong. Masukkan ulang:");
      return;
    }
    session.addUser.title = pangkat;
    session.step = "addUser_satfung";
    // List satfung
    const satfung = await userService.getAvailableSatfung();
    let msg = "*Pilih Satfung* (balas angka atau ketik nama persis):\n";
    msg += satfung.map((s, i) => ` ${i + 1}. ${s}`).join("\n");
    session.availableSatfung = satfung;
    await waClient.sendMessage(chatId, msg);
  },

  addUser_satfung: async (session, chatId, text, waClient, pool, userService) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "🚫 Keluar dari proses tambah user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userService);
    }
    const satfungList = session.availableSatfung || [];
    let satfung = text.trim().toUpperCase();
    if (Number(satfung) > 0 && Number(satfung) <= satfungList.length) {
      satfung = satfungList[Number(satfung) - 1];
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

  addUser_jabatan: async (session, chatId, text, waClient, pool, userService) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "🚫 Keluar dari proses tambah user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userService);
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
      await userService.createUser(session.addUser);
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
    return oprRequestHandlers.main(session, chatId, "", waClient, pool, userService);
  },

  // ==== UPDATE STATUS USER ====
  updateStatus_nrp: async (session, chatId, text, waClient, pool, userService) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "Keluar dari proses ubah status user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userService);
    }
    const nrp = text.trim().replace(/[^0-9a-zA-Z]/g, "");
    const user = await userService.findUserById(nrp);
    if (!user) {
      await waClient.sendMessage(chatId, `❌ User dengan NRP/NIP *${nrp}* tidak ditemukan.`);
      session.step = "main";
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userService);
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

  updateStatus_value: async (session, chatId, text, waClient, pool, userService) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "❎ Keluar dari proses update status user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userService);
    }
    let status = null;
    if (text.trim() === "1") status = true;
    if (text.trim() === "2") status = false;
    if (status === null) {
      await waClient.sendMessage(chatId, "❗ Pilihan tidak valid. Balas 1 untuk *AKTIF* atau 2 untuk *NONAKTIF*.");
      return;
    }
    try {
      await userService.updateUserField(session.updateStatusNRP, "status", status);
      const user = await userService.findUserById(session.updateStatusNRP);
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
    return oprRequestHandlers.main(session, chatId, "", waClient, pool, userService);
  },

  // ==== CEK DATA USER ====
  cekUser_nrp: async (session, chatId, text, waClient, pool, userService) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, "Keluar dari proses cek user.");
      return oprRequestHandlers.main(session, chatId, "", waClient, pool, userService);
    }
    const nrp = text.trim().replace(/[^0-9a-zA-Z]/g, "");
    const user = await userService.findUserById(nrp);
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
    session.step = "main";
    return oprRequestHandlers.main(session, chatId, "", waClient, pool, userService);
  },
};

export default oprRequestHandlers;
