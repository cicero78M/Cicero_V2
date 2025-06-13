// src/handler/userMenuHandlers.js

import {
  sortTitleKeys,
  sortDivisionKeys,
  getGreeting,
} from "../../utils/utilsHelper.js";

// --- Helper Format Pesan ---
function formatUserReport(user) {
  return `
👤 *Identitas Anda*

*Nama*     : ${user.nama || "-"}
*Pangkat*  : ${user.title || "-"}
*NRP/NIP*  : ${user.user_id || "-"}
*Satfung*  : ${user.divisi || "-"}
*Jabatan*  : ${user.jabatan || "-"}
*Instagram*: ${user.insta ? "@" + user.insta.replace(/^@/, "") : "-"}
*TikTok*   : ${user.tiktok || "-"}
*Status*   : ${(user.status === true || user.status === "true") ? "🟢 AKTIF" : "🔴 NONAKTIF"}
`.trim();
}

function menuUtama() {
  return `
┏━━━━━━━ *MENU UTAMA USER* ━━━━━━━┓
  1️⃣  Lihat Data Saya
  2️⃣  Update Data Saya
  3️⃣  Daftar Perintah Manual
  4️⃣  Hubungi Operator
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Silakan balas angka *1-4* atau ketik *batal* untuk keluar.
`.trim();
}

function formatFieldList() {
  return `
✏️ *Pilih field yang ingin diupdate:*
1. Nama
2. Pangkat
3. Satfung
4. Jabatan
5. Instagram
6. TikTok
7. Hapus WhatsApp

Balas angka field di atas atau *batal* untuk keluar.
`.trim();
}

function formatOperatorContact(nama, wa) {
  const nomor = wa.replace(/\D/g, "");
  return `Hubungi Operator: *${nama}* (WA: https://wa.me/${nomor})`;
}

// ===== Handler utama usermenu =====
export const userMenuHandlers = {
  main: async (session, chatId, text, waClient, pool, userModel) => {
    // --- Menu utama / Default
    if (!text || text.toLowerCase() === "menu") {
      await waClient.sendMessage(chatId, menuUtama());
      return;
    }

    // === CASE 1: Lihat Data Saya ===
    if (text === "1" || text.toLowerCase().includes("data")) {
      const pengirim = chatId.replace(/[^0-9]/g, "");
      const userByWA = await userModel.findUserByWhatsApp(pengirim);

      if (userByWA) {
        const salam = getGreeting();
        let msgText = `
${salam}, Bapak/Ibu
${formatUserReport(userByWA)}

Apakah data di atas benar milik Anda?
Balas *ya* jika benar, atau *tidak* jika bukan.
`.trim();
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
    if (text === "2" || text.toLowerCase().includes("update")) {
      const pengirim = chatId.replace(/[^0-9]/g, "");
      const userByWA = await userModel.findUserByWhatsApp(pengirim);

      if (userByWA) {
        const salam = getGreeting();
        let msgText = `
${salam}, Bapak/Ibu
${formatUserReport(userByWA)}

Apakah data di atas benar milik Anda dan ingin melakukan perubahan?
Balas *ya* jika benar, atau *tidak* jika bukan.
`.trim();
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

    // === CASE 3: Daftar Perintah Manual ===
    if (text === "3" || text.toLowerCase().includes("perintah")) {
      await waClient.sendMessage(
        chatId,
        `🛠️ *Daftar Perintah Manual:*\n\n- mydata#NRP/NIP\n- updateuser#NRP/NIP#field#value\nContoh: updateuser#75070206#pangkat#AKP\n\nKetik *batal* untuk keluar dari menu.`
      );
      return;
    }

    // === CASE 4: Hubungi Operator ===
    if (text === "4" || text.toLowerCase().includes("operator")) {
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
          operatorText = formatOperatorContact(op.nama || op.client_id, op.client_operator);
        }
      } catch (e) {}
      await waClient.sendMessage(chatId, operatorText);
      return;
    }

    await waClient.sendMessage(chatId, menuUtama());
  },

  // --- Konfirmasi identitas (lihat data)
  confirmUserByWaIdentity: async (session, chatId, text, waClient, pool, userModel) => {
    if (text.trim().toLowerCase() === "ya") {
      session.step = "tanyaUpdateMyData";
      await waClient.sendMessage(
        chatId,
        "Apakah Anda ingin melakukan perubahan data?\nBalas *ya* jika ingin update data, atau *tidak* untuk kembali ke menu utama."
      );
    } else if (text.trim().toLowerCase() === "tidak") {
      session.step = "main";
      await waClient.sendMessage(
        chatId,
        "Anda kembali ke Menu Utama. Ketik *menu* untuk melihat opsi."
      );
    } else {
      await waClient.sendMessage(
        chatId,
        "Jawaban tidak dikenali. Balas *ya* jika benar data Anda, atau *tidak* jika bukan."
      );
    }
  },

  // --- Konfirmasi identitas untuk update data
  confirmUserByWaUpdate: async (session, chatId, text, waClient, pool, userModel) => {
    if (text.trim().toLowerCase() === "ya") {
      session.updateUserId = session.user_id;
      session.step = "updateAskField";
      await waClient.sendMessage(chatId, formatFieldList());
      return;
    } else if (text.trim().toLowerCase() === "tidak") {
      session.step = "main";
      await waClient.sendMessage(
        chatId,
        "Anda kembali ke Menu Utama. Ketik *menu* untuk melihat opsi."
      );
      return;
    }
    await waClient.sendMessage(
      chatId,
      "Jawaban tidak dikenali. Balas *ya* jika benar data Anda, atau *tidak* jika bukan."
    );
  },

  // --- Input User ID manual
  inputUserId: async (session, chatId, text, waClient, pool, userModel) => {
    const user_id = text.replace(/[^0-9a-zA-Z]/g, "");
    if (!user_id) {
      await waClient.sendMessage(chatId, "NRP/NIP tidak valid. Coba lagi atau ketik *batal*.");
      return;
    }
    try {
      const user = await userModel.findUserById(user_id);
      if (!user) {
        await waClient.sendMessage(chatId, `❌ User dengan NRP/NIP ${user_id} tidak ditemukan.`);
      } else {
        await waClient.sendMessage(chatId, formatUserReport(user));
      }
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal mengambil data: ${err.message}`);
    }
    session.step = "main";
    await waClient.sendMessage(chatId, menuUtama());
  },

  // --- Update User ID manual
  updateAskUserId: async (session, chatId, text, waClient, pool, userModel) => {
    session.updateUserId = text.replace(/[^0-9a-zA-Z]/g, "");
    session.step = "updateAskField";
    await waClient.sendMessage(chatId, formatFieldList());
  },

  // --- Pilih field update
  updateAskField: async (session, chatId, text, waClient, pool, userModel) => {
    const allowedFields = [
      { key: "nama", label: "Nama" },
      { key: "pangkat", label: "Pangkat" },
      { key: "satfung", label: "Satfung" },
      { key: "jabatan", label: "Jabatan" },
      { key: "insta", label: "Instagram" },
      { key: "tiktok", label: "TikTok" },
      { key: "hapus_whatsapp", label: "Hapus WhatsApp" },
    ];

    if (!/^[1-7]$/.test(text.trim())) {
      await waClient.sendMessage(chatId, formatFieldList());
      return;
    }

    const idx = parseInt(text.trim()) - 1;
    const field = allowedFields[idx].key;
    session.updateField = field;

    // Konfirmasi khusus hapus WA
    if (field === "hapus_whatsapp") {
      session.step = "konfirmasiHapusWhatsapp";
      await waClient.sendMessage(
        chatId,
        "⚠️ Apakah Anda yakin ingin *menghapus nomor WhatsApp* dari database?\nBalas *ya* untuk menghapus, *tidak* untuk membatalkan."
      );
      return;
    }

    // Tampilkan list pangkat/satfung jika perlu
    if (field === "pangkat") {
      const titles = await userModel.getAvailableTitles();
      if (titles && titles.length) {
        const sorted = sortTitleKeys(titles, titles);
        let msgList = sorted
          .map((t, i) => `${i + 1}. ${t}`)
          .join("\n");
        // Simpan list pangkat di session agar bisa dipakai saat validasi
        session.availableTitles = sorted;
        await waClient.sendMessage(chatId, "Daftar pangkat yang dapat dipilih:\n" + msgList);
      }
    }
    if (field === "satfung") {
      const satfung = await userModel.getAvailableSatfung();
      if (satfung && satfung.length) {
        const sorted = sortDivisionKeys(satfung);
        let msgList = sorted.map((s, i) => `${i + 1}. ${s}`).join("\n");
        session.availableSatfung = sorted;
        await waClient.sendMessage(
          chatId,
          "Daftar satfung yang dapat dipilih:\n" + msgList
        );
      }
    }
    session.step = "updateAskValue";
    await waClient.sendMessage(
      chatId,
      `Ketik nilai baru untuk field *${allowedFields[idx].label}* (pilih dari daftar jika pangkat/satfung):`
    );
  },

  konfirmasiHapusWhatsapp: async (session, chatId, text, waClient, pool, userModel) => {
    if (text.trim().toLowerCase() === "ya") {
      const user_id = session.updateUserId;
      await userModel.updateUserField(user_id, "whatsapp", "");
      await waClient.sendMessage(
        chatId,
        `✅ Nomor WhatsApp untuk NRP/NIP ${user_id} berhasil dihapus dari database.`
      );
      session.step = "main";
      await waClient.sendMessage(chatId, menuUtama());
      return;
    }
    if (text.trim().toLowerCase() === "tidak") {
      await waClient.sendMessage(chatId, "Dibatalkan. Nomor WhatsApp tidak dihapus.");
      session.step = "main";
      await waClient.sendMessage(chatId, menuUtama());
      return;
    }
    await waClient.sendMessage(
      chatId,
      "Balas *ya* untuk menghapus WhatsApp, *tidak* untuk membatalkan."
    );
  },

  updateAskValue: async (session, chatId, text, waClient, pool, userModel) => {
    const user_id = session.updateUserId;
    let field = session.updateField;
    let value = text.trim();

    // Normalisasi field DB
    if (field === "pangkat") field = "title";
    if (field === "satfung") field = "divisi";

    // Validasi khusus
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
      const satfungList = session.availableSatfung || (await userModel.getAvailableSatfung());
      const normalizedSatfung = satfungList.map((s) => s.toUpperCase());
      if (/^\d+$/.test(value)) {
        const msgList = satfungList.map((s, i) => `${i + 1}. ${s}`).join("\n");
        await waClient.sendMessage(
          chatId,
          `❌ Satfung harus diisi sesuai daftar, gunakan nama pada daftar:\n${msgList}`
        );
        return;
      }
      if (!normalizedSatfung.includes(value.toUpperCase())) {
        const msgList = satfungList.map((s, i) => `${i + 1}. ${s}`).join("\n");
        await waClient.sendMessage(
          chatId,
          `❌ Satfung tidak valid! Pilih sesuai daftar:\n${msgList}`
        );
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
    if (field === "whatsapp") value = value.replace(/[^0-9]/g, "");

    await userModel.updateUserField(user_id, field, value);
    await waClient.sendMessage(
      chatId,
      `✅ Data *${field === "title" ? "pangkat" : field === "divisi" ? "satfung" : field}* untuk NRP/NIP ${user_id} berhasil diupdate menjadi *${value}*.`
    );
    delete session.availableTitles;
    delete session.availableSatfung;
    session.step = "main";
    await waClient.sendMessage(chatId, menuUtama());
  },

  tanyaUpdateMyData: async (session, chatId, text, waClient, pool, userModel) => {
    if (text.trim().toLowerCase() === "ya") {
      session.step = "confirmUserByWaUpdate";
      await userMenuHandlers.confirmUserByWaUpdate(
        session,
        chatId,
        "ya",
        waClient,
        pool,
        userModel
      );
      return;
    } else if (text.trim().toLowerCase() === "tidak") {
      session.step = "main";
      await waClient.sendMessage(chatId, menuUtama());
      return;
    }
    await waClient.sendMessage(
      chatId,
      "Balas *ya* jika ingin update data, atau *tidak* untuk kembali."
    );
  },
};
