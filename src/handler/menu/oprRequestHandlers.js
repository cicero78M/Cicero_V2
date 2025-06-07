// src/handler/menu/oprRequestHandlers.js

export const oprRequestHandlers = {
  main: async (session, chatId, text, waClient, pool, userService) => {
    let msg =
      `🛠️ *Menu Operator User Cicero*\n` +
      `Hanya dapat digunakan oleh operator client Anda.\n\n` +
      `1. Tambah user baru\n` +
      `2. Perubahan status user (aktif/nonaktif)\n` +
      `3. Cek data user (NRP/NIP)\n\n` +
      `Ketik angka menu di atas, atau *batal* untuk keluar.`;
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
    if (text.trim() === "1") {
      clean();
      session.step = "addUser_nrp";
      await waClient.sendMessage(
        chatId,
        "Masukkan NRP/NIP (belum terdaftar di database):"
      );
      return;
    }
    if (text.trim() === "2") {
      clean();
      session.step = "updateStatus_nrp";
      await waClient.sendMessage(
        chatId,
        "Masukkan NRP/NIP user yang ingin diubah statusnya:"
      );
      return;
    }
    if (text.trim() === "3") {
      clean();
      session.step = "cekUser_nrp";
      await waClient.sendMessage(
        chatId,
        "Masukkan NRP/NIP user yang ingin dicek:"
      );
      return;
    }
    if (text.trim().toLowerCase() === "batal") {
      session.menu = null;
      session.step = null;
      clean();
      await waClient.sendMessage(chatId, "Keluar dari menu operator.");
      return;
    }
    await waClient.sendMessage(
      chatId,
      "Menu tidak dikenali. Pilih 1, 2, atau 3, atau *batal*."
    );
  },

  // ==== TAMBAH USER ====
  addUser_nrp: async (session, chatId, text, waClient, pool, userService) => {
    if (text.trim().toLowerCase() === "batal") {
      session.step = "main";
      await waClient.sendMessage(chatId, "Keluar dari proses tambah user.");
      return oprRequestHandlers.main(
        session,
        chatId,
        "",
        waClient,
        pool,
        userService
      );
    }
    const nrp = text.trim().replace(/[^0-9a-zA-Z]/g, "");
    if (!nrp) {
      await waClient.sendMessage(
        chatId,
        "NRP/NIP tidak valid. Silakan masukkan ulang."
      );
      return;
    }
    const existing = await userService.findUserById(nrp);
    if (existing) {
      let msg = `NRP/NIP *${nrp}* sudah terdaftar atas nama berikut:\n`;
      msg += `*Nama*: ${existing.nama || "-"}\n*Pangkat*: ${
        existing.title || "-"
      }\n*Satfung*: ${existing.divisi || "-"}\n*Jabatan*: ${
        existing.jabatan || "-"
      }\n*Status*: ${existing.status ? "AKTIF" : "NONAKTIF"}\n`;
      await waClient.sendMessage(
        chatId,
        msg + "\nTidak bisa menambahkan user baru dengan NRP/NIP ini."
      );
      session.step = "main";
      return oprRequestHandlers.main(
        session,
        chatId,
        "",
        waClient,
        pool,
        userService
      );
    }
    session.addUser = { user_id: nrp };
    session.step = "addUser_nama";
    await waClient.sendMessage(
      chatId,
      "Masukkan *Nama Lengkap* (gunakan huruf kapital, contoh: ANDI PRASETYO):"
    );
  },

  addUser_nama: async (session, chatId, text, waClient, pool, userService) => {
    if (text.trim().toLowerCase() === "batal") {
      session.step = "main";
      await waClient.sendMessage(chatId, "Keluar dari proses tambah user.");
      return oprRequestHandlers.main(
        session,
        chatId,
        "",
        waClient,
        pool,
        userService
      );
    }
    const nama = text.trim().toUpperCase();
    if (!nama) {
      await waClient.sendMessage(
        chatId,
        "Nama tidak boleh kosong. Masukkan ulang."
      );
      return;
    }
    session.addUser.nama = nama;
    session.step = "addUser_pangkat";
    await waClient.sendMessage(
      chatId,
      "Masukkan *Pangkat* (huruf kapital, contoh: BRIPKA):"
    );
  },

  addUser_pangkat: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    if (text.trim().toLowerCase() === "batal") {
      session.step = "main";
      await waClient.sendMessage(chatId, "Keluar dari proses tambah user.");
      return oprRequestHandlers.main(
        session,
        chatId,
        "",
        waClient,
        pool,
        userService
      );
    }
    const pangkat = text.trim().toUpperCase();
    if (!pangkat) {
      await waClient.sendMessage(
        chatId,
        "Pangkat tidak boleh kosong. Masukkan ulang."
      );
      return;
    }
    session.addUser.title = pangkat;
    session.step = "addUser_satfung";
    // Ambil satfung dari database
    const satfung = await userService.getAvailableSatfung();
    let msg = "Masukkan *Satfung* (pilih sesuai daftar):\n";
    msg += satfung.map((s, i) => `${i + 1}. ${s}`).join("\n");
    session.availableSatfung = satfung;
    await waClient.sendMessage(chatId, msg);
  },

  addUser_satfung: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    if (text.trim().toLowerCase() === "batal") {
      session.step = "main";
      await waClient.sendMessage(chatId, "Keluar dari proses tambah user.");
      return oprRequestHandlers.main(
        session,
        chatId,
        "",
        waClient,
        pool,
        userService
      );
    }
    const satfungList = session.availableSatfung || [];
    let satfung = text.trim().toUpperCase();
    if (Number(satfung) > 0 && Number(satfung) <= satfungList.length) {
      satfung = satfungList[Number(satfung) - 1];
    }
    if (!satfungList.map((s) => s.toUpperCase()).includes(satfung)) {
      let msg = "Satfung tidak valid! Pilih sesuai daftar berikut:\n";
      msg += satfungList.map((s, i) => `${i + 1}. ${s}`).join("\n");
      await waClient.sendMessage(chatId, msg);
      return;
    }
    session.addUser.divisi = satfung;
    session.step = "addUser_jabatan";
    await waClient.sendMessage(
      chatId,
      "Masukkan *Jabatan* (huruf kapital, contoh: BAURMIN):"
    );
  },

  addUser_jabatan: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    if (text.trim().toLowerCase() === "batal") {
      session.step = "main";
      await waClient.sendMessage(chatId, "Keluar dari proses tambah user.");
      return oprRequestHandlers.main(
        session,
        chatId,
        "",
        waClient,
        pool,
        userService
      );
    }
    const jabatan = text.trim().toUpperCase();
    if (!jabatan) {
      await waClient.sendMessage(
        chatId,
        "Jabatan tidak boleh kosong. Masukkan ulang."
      );
      return;
    }
    session.addUser.jabatan = jabatan;

    // Set default value lain
    session.addUser.status = true;
    session.addUser.exception = false;

    // Simpan ke DB
    try {
      await userService.createUser(session.addUser);
      await waClient.sendMessage(
        chatId,
        `✅ User baru berhasil ditambahkan:\n*NRP*: ${session.addUser.user_id}\n*Nama*: ${session.addUser.nama}\n*Pangkat*: ${session.addUser.title}\n*Satfung*: ${session.addUser.divisi}\n*Jabatan*: ${session.addUser.jabatan}\n(Status: Aktif, Exception: False)`
      );
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal menambahkan user: ${err.message}`
      );
    }
    session.step = "main";
    return oprRequestHandlers.main(
      session,
      chatId,
      "",
      waClient,
      pool,
      userService
    );
  },

  // ==== UPDATE STATUS USER ====
  updateStatus_nrp: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    const nrp = text.trim().replace(/[^0-9a-zA-Z]/g, "");
    const user = await userService.findUserById(nrp);
    if (!user) {
      await waClient.sendMessage(
        chatId,
        `❌ User dengan NRP/NIP *${nrp}* tidak ditemukan.`
      );
      session.step = "main";
      await oprRequestHandlers.main(
        session,
        chatId,
        "",
        waClient,
        pool,
        userService
      );
      return;
    }
    // Percantik tampilan info user
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

Balas *angka* (1 atau 2) sesuai status baru yang ingin diubah.
Ketik *batal* untuk kembali ke menu utama operator.
`.trim();

    session.updateStatusNRP = nrp;
    session.step = "updateStatus_value";
    await waClient.sendMessage(chatId, msg);
  },

  updateStatus_value: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    if (text.trim().toLowerCase() === "batal") {
      session.step = "main";
      await waClient.sendMessage(
        chatId,
        "Keluar dari proses update status user."
      );
      return oprRequestHandlers.main(
        session,
        chatId,
        "",
        waClient,
        pool,
        userService
      );
    }
    let status = null;
    if (text.trim() === "1") status = true;
    if (text.trim() === "2") status = false;
    if (status === null) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas 1 untuk *AKTIF* atau 2 untuk *NONAKTIF*."
      );
      return;
    }
    try {
      await userService.updateUserField(
        session.updateStatusNRP,
        "status",
        status
      );
      const user = await userService.findUserById(session.updateStatusNRP);
      let statusStr = status ? "🟢 *AKTIF*" : "🔴 *NONAKTIF*";
      let msg = `
✅ *Status user berhasil diubah!*

━━━━━━━━━━━━━━━━━━━━━━
*NRP/NIP*   : ${user.user_id}
*Nama*      : ${user.nama || "-"}
*Status*    : ${statusStr}
━━━━━━━━━━━━━━━━━━━━━━
`.trim();
      await waClient.sendMessage(chatId, msg);
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal update status: ${err.message}`
      );
    }
    session.step = "main";
    return oprRequestHandlers.main(
      session,
      chatId,
      "",
      waClient,
      pool,
      userService
    );
  },

  // ==== CEK DATA USER ====
  cekUser_nrp: async (session, chatId, text, waClient, pool, userService) => {
    if (text.trim().toLowerCase() === "batal") {
      session.step = "main";
      await waClient.sendMessage(chatId, "Keluar dari proses cek user.");
      return oprRequestHandlers.main(
        session,
        chatId,
        "",
        waClient,
        pool,
        userService
      );
    }
    const nrp = text.trim().replace(/[^0-9a-zA-Z]/g, "");
    const user = await userService.findUserById(nrp);
    if (!user) {
      await waClient.sendMessage(
        chatId,
        `❌ User dengan NRP/NIP *${nrp}* tidak ditemukan.`
      );
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
    return oprRequestHandlers.main(
      session,
      chatId,
      "",
      waClient,
      pool,
      userService
    );
  },
};

export default oprRequestHandlers;
