// ===== Handler utama usermenu =====
export const userMenuHandlers = {
  main: async (session, chatId, text, waClient, pool, userService) => {
    // Helper salam
    function getGreeting() {
      const now = new Date();
      const hour = now.getHours();
      if (hour >= 4 && hour < 10) return "Selamat pagi";
      if (hour >= 10 && hour < 15) return "Selamat siang";
      if (hour >= 15 && hour < 18) return "Selamat sore";
      return "Selamat malam";
    }

    // Helper untuk tampil data user
    function formatUserData(user) {
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
      let msgText = "";
      order.forEach((k) => {
        if (user[k] !== undefined && user[k] !== null) {
          let val = user[k];
          let label = fieldMap[k] || k;
          if (k === "status")
            val = val === true || val === "true" ? "AKTIF" : "AKUN DIHAPUS";
          msgText += `*${label}*: ${val}\n`;
        }
      });
      return msgText;
    }

    // === CASE 1: Lihat Data Saya ===
    if (text === "1") {
      const pengirim = chatId.replace(/[^0-9]/g, "");
      const userByWA = (await userService.findUserByWhatsApp)
        ? await userService.findUserByWhatsApp(pengirim)
        : await findUserByWhatsApp(pengirim); // fallback jika import langsung

      if (userByWA) {
        const salam = getGreeting();
        const pangkat = userByWA.title || "-";
        const nama = userByWA.nama || "-";
        const nrp = userByWA.user_id || "-";
        let msgText =
          `👋 ${salam}, Bapak/Ibu *${pangkat} ${nama}* (NRP/NIP: *${nrp}*)\n\n` +
          `Nomor WhatsApp Anda *${pengirim}* terdaftar atas nama berikut:\n\n` +
          formatUserData(userByWA) +
          `\nApakah data di atas benar milik Anda?\n` +
          `Balas *ya* jika benar, atau *tidak* jika bukan.`;

        session.step = "confirmUserByWaIdentity";
        session.user_id = userByWA.user_id;
        await waClient.sendMessage(chatId, msgText);
        return;
      } else {
        session.step = "inputUserId";
        await waClient.sendMessage(
          chatId,
          "Ketik NRP/NIP Anda untuk melihat data. (contoh: 75070206)"
        );
        return;
      }
    }

    // === CASE 2: Update Data Saya ===
    if (text === "2") {
      const pengirim = chatId.replace(/[^0-9]/g, "");
      const userByWA = (await userService.findUserByWhatsApp)
        ? await userService.findUserByWhatsApp(pengirim)
        : await findUserByWhatsApp(pengirim);

      if (userByWA) {
        const salam = getGreeting();
        const pangkat = userByWA.title || "-";
        const nama = userByWA.nama || "-";
        const nrp = userByWA.user_id || "-";
        let msgText =
          `👋 ${salam}, Bapak/Ibu *${pangkat} ${nama}* (NRP/NIP: *${nrp}*)\n\n` +
          `Nomor WhatsApp Anda *${pengirim}* terdaftar atas nama berikut:\n\n` +
          formatUserData(userByWA) +
          `\nApakah data di atas benar milik Anda dan ingin melakukan perubahan?\n` +
          `Balas *ya* jika benar, atau *tidak* jika bukan.`;

        session.step = "confirmUserByWaUpdate";
        session.user_id = userByWA.user_id;
        await waClient.sendMessage(chatId, msgText);
        return;
      } else {
        session.step = "updateAskUserId";
        await waClient.sendMessage(
          chatId,
          "Ketik NRP/NIP Anda yang ingin diupdate:"
        );
        return;
      }
    }

    // === CASE 3: Daftar Perintah User ===
    if (text === "3") {
      await waClient.sendMessage(
        chatId,
        `🛠️ *Daftar Perintah User:*\n\n` +
          `- mydata#NRP/NIP\n` +
          `- updateuser#NRP/NIP#field#value\n` +
          `Contoh: updateuser#75070206#pangkat#AKP\n` +
          `Ketik *batal* untuk keluar dari menu.\n\n` +
          `ℹ️ Untuk update manual, lihat info lengkap: *userrequest* (menu interaktif jauh lebih mudah).`
      );
      return;
    }

    // === CASE 4: Hubungi Operator ===
    if (text === "4") {
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
      return;
    }

    await waClient.sendMessage(
      chatId,
      "Pilihan tidak valid. Balas dengan 1, 2, 3, atau 4."
    );
  },

  confirmUserByWaIdentity: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    if (text.trim().toLowerCase() === "ya") {
      session.step = "tanyaUpdateMyData";
      await waClient.sendMessage(
        chatId,
        "Apakah Anda ingin melakukan perubahan data?\nBalas *ya* jika ingin update data, atau *tidak* untuk kembali ke menu utama."
      );
    } else if (text.trim().toLowerCase() === "tidak") {
      session.step = "main";
      // Cari client_operator dari client_id milik user
      let operatorText = "Silakan hubungi operator untuk perbaikan data.";
      try {
        const user = await userService.findUserById(session.user_id);
        if (user && user.client_id) {
          const q = `SELECT nama, client_operator FROM clients WHERE client_id=$1 LIMIT 1`;
          const res = await pool.query(q, [user.client_id]);
          if (res.rows && res.rows[0] && res.rows[0].client_operator) {
            const namaOp = res.rows[0].nama || "Operator";
            const opWA = res.rows[0].client_operator.replace(/\D/g, "");
            operatorText =
              `Silakan hubungi operator untuk perbaikan data.\n` +
              `*${namaOp}* (WA: https://wa.me/${opWA})`;
          }
        }
      } catch (e) {
        // fallback: tetap kirim pesan standar jika gagal query
        console.error("[USERMENU][QUERY_OPERATOR] ERROR:", e);

        // Kirim notifikasi error ke admin
        const admins = (process.env.ADMIN_WHATSAPP || "")
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
          .map((n) =>
            n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"
          );
        const debugMsg = `[USERMENU][QUERY_OPERATOR] ERROR:\n${
          e.stack || e.message
        }`;
        for (const admin of admins) {
          waClient.sendMessage(admin, debugMsg).catch(() => {});
        }
      }

      await waClient.sendMessage(chatId, operatorText);
      await waClient.sendMessage(
        chatId,
        "Anda kembali ke Menu Utama. Pilih menu (1-4) atau *batal*."
      );
      return;
    } else {
      await waClient.sendMessage(
        chatId,
        "Jawaban tidak dikenali. Balas *ya* jika benar data Anda, atau *tidak* jika bukan."
      );
    }
  },

  // Konfirmasi identitas data WA untuk update data
  confirmUserByWaUpdate: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    if (text.trim().toLowerCase() === "ya") {
      session.updateUserId = session.user_id;
      session.step = "updateAskField";
      // === Mulai: tampilkan menu angka pilihan field ===
      const allowedFields = [
        { key: "nama", label: "Nama" },
        { key: "pangkat", label: "Pangkat" },
        { key: "satfung", label: "Satfung" },
        { key: "jabatan", label: "Jabatan" },
        { key: "insta", label: "Instagram" },
        { key: "tiktok", label: "TikTok" },
        { key: "hapus_whatsapp", label: "Hapus WhatsApp" },
      ];
      let msg = `Pilih field yang ingin diupdate:\n`;
      allowedFields.forEach((f, i) => {
        msg += `${i + 1}. ${f.label}\n`;
      });
      msg += `\nBalas dengan angka sesuai daftar di atas.`;
      await waClient.sendMessage(chatId, msg);
      // === Selesai ===
      return;
    } else if (text.trim().toLowerCase() === "tidak") {
      session.step = "main";
      // ... sisanya tetap seperti yang sudah Anda tulis ...
      let operatorText = "Silakan hubungi operator untuk perbaikan data.";
      try {
        const user = await userService.findUserById(session.user_id);
        if (user && user.client_id) {
          const q = `SELECT nama, client_operator FROM clients WHERE client_id=$1 LIMIT 1`;
          const res = await pool.query(q, [user.client_id]);
          if (res.rows && res.rows[0] && res.rows[0].client_operator) {
            const namaOp = res.rows[0].nama || "Operator";
            const opWA = res.rows[0].client_operator.replace(/\D/g, "");
            operatorText =
              `Silakan hubungi operator untuk perbaikan data.\n` +
              `*${namaOp}* (WA: https://wa.me/${opWA})`;
          }
        }
      } catch (e) {
        console.error("[USERMENU][QUERY_OPERATOR] ERROR:", e);
        const admins = (process.env.ADMIN_WHATSAPP || "")
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
          .map((n) =>
            n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"
          );
        const debugMsg = `[USERMENU][QUERY_OPERATOR] ERROR:\n${
          e.stack || e.message
        }`;
        for (const admin of admins) {
          waClient.sendMessage(admin, debugMsg).catch(() => {});
        }
      }
      await waClient.sendMessage(chatId, operatorText);
      await waClient.sendMessage(
        chatId,
        "Anda kembali ke Menu Utama. Pilih menu (1-4) atau *batal*."
      );
    } else {
      await waClient.sendMessage(
        chatId,
        "Jawaban tidak dikenali. Balas *ya* jika benar data Anda, atau *tidak* jika bukan."
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
    // --- Mulai: ubah jadi menu angka field
    const allowedFields = [
      { key: "nama", label: "Nama" },
      { key: "pangkat", label: "Pangkat" },
      { key: "satfung", label: "Satfung" },
      { key: "jabatan", label: "Jabatan" },
      { key: "insta", label: "Instagram" },
      { key: "tiktok", label: "TikTok" },
      { key: "hapus_whatsapp", label: "Hapus WhatsApp" },
    ];
    let msg = `Pilih field yang ingin diupdate:\n`;
    allowedFields.forEach((f, i) => {
      msg += `${i + 1}. ${f.label}\n`;
    });
    msg += `\nBalas dengan angka sesuai daftar di atas.`;
    await waClient.sendMessage(chatId, msg);
    // --- Selesai ubah jadi menu angka field
  },

  // [START UPDATE: FIELD PILIHAN ANGKA]
  updateAskField: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    // Daftar field
    const allowedFields = [
      { key: "nama", label: "Nama" },
      { key: "pangkat", label: "Pangkat" },
      { key: "satfung", label: "Satfung" },
      { key: "jabatan", label: "Jabatan" },
      { key: "insta", label: "Instagram" },
      { key: "tiktok", label: "TikTok" },
      { key: "hapus_whatsapp", label: "Hapus WhatsApp" },
    ];

    // Jika text belum berupa angka field, tampilkan menu
    if (!/^[1-7]$/.test(text.trim())) {
      let msg = `Pilih field yang ingin diupdate:\n`;
      allowedFields.forEach((f, i) => {
        msg += `${i + 1}. ${f.label}\n`;
      });
      msg += `\nBalas dengan angka sesuai daftar di atas.`;
      await waClient.sendMessage(chatId, msg);
      return;
    }

    // User memilih field by angka
    const idx = parseInt(text.trim()) - 1;
    const field = allowedFields[idx].key;
    session.updateField = field;

    // Hapus whatsapp: konfirmasi hapus!
    if (field === "hapus_whatsapp") {
      session.step = "konfirmasiHapusWhatsapp";
      await waClient.sendMessage(
        chatId,
        "⚠️ Apakah Anda yakin ingin *menghapus nomor WhatsApp* dari database?\nBalas *ya* untuk menghapus, *tidak* untuk membatalkan."
      );
      return;
    }

    // --- jika pangkat/satfung, tampilkan pilihan dari DB & urutkan ---
    if (field === "pangkat") {
      const titles = await userService.getAvailableTitles();
      if (!titles || titles.length === 0) {
        await waClient.sendMessage(
          chatId,
          "Data pangkat tidak ditemukan di database."
        );
        return;
      }
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
      `Ketik nilai baru untuk field *${allowedFields[idx].label}* (pilih dari daftar jika pangkat/satfung):`
    );
  },

  // Konfirmasi hapus whatsapp
  konfirmasiHapusWhatsapp: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    if (text.trim().toLowerCase() === "ya") {
      // Lakukan hapus whatsapp
      const user_id = session.updateUserId;
      await userService.updateUserField(user_id, "whatsapp", "");
      await waClient.sendMessage(
        chatId,
        `✅ Nomor WhatsApp untuk NRP/NIP ${user_id} berhasil dihapus dari database.`
      );
      session.step = "main";
      await waClient.sendMessage(
        chatId,
        "Anda kembali ke Menu Utama. Pilih menu (1-4) atau *batal*."
      );
      return;
    }
    if (text.trim().toLowerCase() === "tidak") {
      await waClient.sendMessage(
        chatId,
        "Dibatalkan. Nomor WhatsApp tidak dihapus."
      );
      session.step = "main";
      await waClient.sendMessage(
        chatId,
        "Anda kembali ke Menu Utama. Pilih menu (1-4) atau *batal*."
      );
      return;
    }
    await waClient.sendMessage(
      chatId,
      "Balas *ya* untuk menghapus WhatsApp, *tidak* untuk membatalkan."
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

  // Handler step: tanyaUpdateMyData
  tanyaUpdateMyData: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userService
  ) => {
    if (text.trim().toLowerCase() === "ya") {
      session.step = "confirmUserByWaUpdate";
      // Call handler langsung (supaya tidak ada lag)
      await userMenuHandlers.confirmUserByWaUpdate(
        session,
        chatId,
        "ya",
        waClient,
        pool,
        userService
      );
      return;
    } else if (text.trim().toLowerCase() === "tidak") {
      session.step = "main";
      await waClient.sendMessage(
        chatId,
        "Kembali ke Menu Utama. Pilih menu (1-4) atau *batal*."
      );
      return;
    }
    await waClient.sendMessage(
      chatId,
      "Balas *ya* jika ingin update data, atau *tidak* untuk kembali."
    );
  },
};
