// src/handler/userMenuHandlers.js

import {
  sortTitleKeys,
  sortDivisionKeys,
  getGreeting,
} from "../../utils/utilsHelper.js";
import { saveContactIfNew } from "../../service/googleContactsService.js";
import { formatToWhatsAppId } from "../../utils/waHelper.js";

function ignore(..._args) {}

// --- Helper Format Pesan ---
function formatUserReport(user) {
  return [
    "👤 *Identitas Anda*",
    "",
    `*Nama*     : ${user.nama || "-"}`,
    `*Pangkat*  : ${user.title || "-"}`,
    `*NRP/NIP*  : ${user.user_id || "-"}`,
    `*Satfung*  : ${user.divisi || "-"}`,
    `*Jabatan*  : ${user.jabatan || "-"}`,
    ...(user.ditbinmas ? [`*Desa Binaan* : ${user.desa || "-"}`] : []),
    `*Instagram*: ${user.insta ? "@" + user.insta.replace(/^@/, "") : "-"}`,
    `*TikTok*   : ${user.tiktok || "-"}`,
    `*Status*   : ${(user.status === true || user.status === "true") ? "🟢 AKTIF" : "🔴 NONAKTIF"}`,
  ].join("\n").trim();
}

function formatFieldList(showDesa = false) {
  return `
✏️ *Pilih field yang ingin diupdate:*
1. Nama
2. Pangkat
3. Satfung
4. Jabatan
5. Instagram
6. TikTok
7. Hapus WhatsApp${showDesa ? "\n8. Desa Binaan" : ""}

Balas angka field di atas atau *batal* untuk keluar.
`.trim();
}



// ===== Handler utama usermenu =====
export const userMenuHandlers = {
  main: async (session, chatId, _text, waClient, _pool, userModel) => {
    const pengirim = chatId.replace(/[^0-9]/g, "");
    const userByWA = await userModel.findUserByWhatsApp(pengirim);

    if (userByWA) {
      session.isDitbinmas = !!userByWA.ditbinmas;
      const salam = getGreeting();
      if (session.identityConfirmed && session.user_id === userByWA.user_id) {
        const msgText = `${salam}, Bapak/Ibu\n${formatUserReport(
          userByWA
        )}\n\nApakah Anda ingin melakukan perubahan data?\nBalas *ya* jika ingin update data, atau *tidak* untuk keluar.`;
        session.step = "tanyaUpdateMyData";
        await waClient.sendMessage(chatId, msgText.trim());
        return;
      }
      const msgText = `
${salam}, Bapak/Ibu
${formatUserReport(userByWA)}

Apakah data di atas benar milik Anda?
Balas *ya* jika benar, atau *tidak* jika bukan.
`.trim();
      session.step = "confirmUserByWaIdentity";
      session.user_id = userByWA.user_id;
      await waClient.sendMessage(chatId, msgText);
      return;
    }

    session.step = "inputUserId";
    await waClient.sendMessage(
      chatId,
      "Ketik NRP Anda untuk melihat data. (contoh: 75070206)"
    );
  },

  // --- Konfirmasi identitas (lihat data)
  confirmUserByWaIdentity: async (session, chatId, text, waClient, pool, userModel) => {
    if (text.trim().toLowerCase() === "ya") {
      session.identityConfirmed = true;
      session.step = "tanyaUpdateMyData";
      await waClient.sendMessage(
        chatId,
        "Apakah Anda ingin melakukan perubahan data?\nBalas *ya* jika ingin update data, atau *tidak* untuk keluar."
      );
    } else if (text.trim().toLowerCase() === "tidak") {
      session.exit = true;
      await waClient.sendMessage(
        chatId,
        "Baik, terima kasih. Ketik *userrequest* untuk memulai lagi."
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
      session.identityConfirmed = true;
      session.updateUserId = session.user_id;
      session.step = "updateAskField";
      await waClient.sendMessage(chatId, formatFieldList(session.isDitbinmas));
      return;
    } else if (text.trim().toLowerCase() === "tidak") {
      session.exit = true;
      await waClient.sendMessage(
        chatId,
        "Baik, terima kasih. Ketik *userrequest* untuk memulai lagi."
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
    const lower = text.trim().toLowerCase();
    if (lower === "batal") {
      session.exit = true;
      await waClient.sendMessage(chatId, "✅ Menu ditutup. Terima kasih.");
      return;
    }
    if (lower === "userrequest") {
      await userMenuHandlers.main(session, chatId, "", waClient, pool, userModel);
      return;
    }
    const user_id = text.trim();
    if (!/^\d+$/.test(user_id)) {
      await waClient.sendMessage(
        chatId,
        "❌ NRP hanya boleh berisi angka.\nContoh: 87020990\nKetik *batal* untuk keluar."
      );
      return;
    }
    try {
      const user = await userModel.findUserById(user_id);
      if (!user) {
        await waClient.sendMessage(chatId, `❌ NRP *${user_id}* tidak ditemukan. Jika yakin benar, hubungi Opr Humas Polres Anda.`);
      } else {
        session.step = "confirmBindUser";
        session.bindUserId = user_id;
        await waClient.sendMessage(
          chatId,
          `NRP *${user_id}* ditemukan. Nomor WhatsApp ini belum terdaftar.\n` +
            "Apakah Anda ingin menghubungkannya dengan akun tersebut?\n" +
            "Balas *ya* untuk menghubungkan atau *tidak* untuk membatalkan."
        );
        return;
      }
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal mengambil data: ${err.message}`);
    }
    session.exit = true;
    await waClient.sendMessage(chatId, "Ketik *userrequest* untuk memulai lagi.");
  },

  confirmBindUser: async (session, chatId, text, waClient, pool, userModel) => {
    const answer = text.trim().toLowerCase();
    const waNum = chatId.replace(/[^0-9]/g, "");
    if (answer === "ya") {
      const user_id = session.bindUserId;
      await userModel.updateUserField(user_id, "whatsapp", waNum);
      await saveContactIfNew(formatToWhatsAppId(waNum));
      const user = await userModel.findUserById(user_id);
      session.isDitbinmas = !!user.ditbinmas;
      await waClient.sendMessage(
        chatId,
        `✅ Nomor WhatsApp telah dihubungkan ke NRP *${user_id}*. Berikut datanya:\n` +
          formatUserReport(user)
      );
      session.identityConfirmed = true;
      session.user_id = user_id;
      await userMenuHandlers.main(session, chatId, "", waClient, pool, userModel);
      return;
    }
    if (answer === "tidak") {
      await waClient.sendMessage(chatId, "Baik, nomor tidak dihubungkan.");
      session.exit = true;
      return;
    }
    await waClient.sendMessage(chatId, "Balas *ya* untuk menghubungkan nomor, atau *tidak* untuk membatalkan.");
  },

  // --- Update User ID manual
  updateAskUserId: async (session, chatId, text, waClient, pool, userModel) => {
    const lower = text.trim().toLowerCase();
    if (lower === "batal") {
      session.exit = true;
      await waClient.sendMessage(chatId, "✅ Menu ditutup. Terima kasih.");
      return;
    }
    const nrp = text.trim();
    if (!/^\d+$/.test(nrp)) {
      await waClient.sendMessage(
        chatId,
        "❌ NRP hanya boleh berisi angka.\nContoh: 87020990\nKetik *batal* untuk keluar."
      );
      return;
    }
    const user = await userModel.findUserById(nrp);
    if (!user) {
      await waClient.sendMessage(chatId, `❌ NRP *${nrp}* tidak ditemukan. Jika yakin benar, hubungi Opr Humas Polres Anda.`);
      session.exit = true;
      await waClient.sendMessage(chatId, "Ketik *userrequest* untuk memulai lagi.");
      return;
    }
    session.updateUserId = nrp;
    session.isDitbinmas = !!user.ditbinmas;
    session.step = "confirmBindUpdate";
    await waClient.sendMessage(
      chatId,
      `NRP *${nrp}* ditemukan. Nomor WhatsApp ini belum terdaftar.\n` +
        "Apakah Anda ingin menghubungkannya dan melanjutkan update?\n" +
        "Balas *ya* untuk menghubungkan atau *tidak* untuk membatalkan."
    );
  },

  confirmBindUpdate: async (session, chatId, text, waClient, pool, userModel) => {
    const ans = text.trim().toLowerCase();
    const waNum = chatId.replace(/[^0-9]/g, "");
    if (ans === "ya") {
      const nrp = session.updateUserId;
      await userModel.updateUserField(nrp, "whatsapp", waNum);
      await saveContactIfNew(formatToWhatsAppId(waNum));
      await waClient.sendMessage(chatId, `✅ Nomor berhasil dihubungkan ke NRP *${nrp}*.`);
      session.identityConfirmed = true;
      session.user_id = nrp;
      session.step = "updateAskField";
      await waClient.sendMessage(chatId, formatFieldList(session.isDitbinmas));
      return;
    }
    if (ans === "tidak") {
      await waClient.sendMessage(chatId, "Proses update dibatalkan.");
      session.exit = true;
      return;
    }
    await waClient.sendMessage(chatId, "Balas *ya* untuk menghubungkan nomor, atau *tidak* untuk membatalkan.");
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
    if (session.isDitbinmas) {
      allowedFields.push({ key: "desa", label: "Desa Binaan" });
    }

    const lower = text.trim().toLowerCase();
    const maxOption = allowedFields.length;
    if (lower === "batal") {
      session.exit = true;
      await waClient.sendMessage(chatId, "✅ Menu ditutup. Terima kasih.");
      return;
    }
    if (!new RegExp(`^[1-${maxOption}]$`).test(lower)) {
      await waClient.sendMessage(
        chatId,
        "❌ Pilihan tidak valid. Balas dengan angka sesuai daftar (contoh: 1) atau ketik *batal* untuk keluar."
      );
      await waClient.sendMessage(chatId, formatFieldList(session.isDitbinmas));
      return;
    }

    const idx = parseInt(lower) - 1;
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
        await waClient.sendMessage(
          chatId,
          "Daftar satfung yang dapat dipilih:\n" + msgList
        );
      }
    }
    session.step = "updateAskValue";
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

  konfirmasiHapusWhatsapp: async (session, chatId, text, waClient, pool, userModel) => {
    if (text.trim().toLowerCase() === "ya") {
      const user_id = session.updateUserId;
      await userModel.updateUserField(user_id, "whatsapp", "");
      await waClient.sendMessage(
        chatId,
        `✅ Nomor WhatsApp untuk NRP ${user_id} berhasil dihapus dari database.`
      );
      await userMenuHandlers.main(session, chatId, "", waClient, pool, userModel);
      return;
    }
    if (text.trim().toLowerCase() === "tidak") {
      await waClient.sendMessage(chatId, "Dibatalkan. Nomor WhatsApp tidak dihapus.");
      await userMenuHandlers.main(session, chatId, "", waClient, pool, userModel);
      return;
    }
    await waClient.sendMessage(
      chatId,
      "Balas *ya* untuk menghapus WhatsApp, *tidak* untuk membatalkan."
    );
  },

  updateAskValue: async (session, chatId, text, waClient, pool, userModel) => {
    const lower = text.trim().toLowerCase();
    if (lower === "batal") {
      session.exit = true;
      await waClient.sendMessage(chatId, "Perubahan dibatalkan. Ketik *userrequest* untuk memulai lagi.");
      return;
    }
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
      let clientId = null;
      try {
        const user = await userModel.findUserById(session.updateUserId);
        clientId = user?.client_id || null;
      } catch (e) { console.error(e); }
      const satfungList =
        session.availableSatfung || (await userModel.getAvailableSatfung(clientId));
      const normalizedSatfung = satfungList.map((s) => s.toUpperCase());
      if (/^\d+$/.test(value)) {
        const idx = parseInt(value, 10) - 1;
        if (idx >= 0 && idx < satfungList.length) {
          value = satfungList[idx];
        } else {
          const msgList = satfungList.map((s, i) => `${i + 1}. ${s}`).join("\n");
          await waClient.sendMessage(
            chatId,
            `❌ Satfung tidak valid! Pilih sesuai daftar:\n${msgList}`
          );
          return;
        }
      } else if (!normalizedSatfung.includes(value.toUpperCase())) {
        const msgList = satfungList.map((s, i) => `${i + 1}. ${s}`).join("\n");
        await waClient.sendMessage(
          chatId,
          `❌ Satfung tidak valid! Pilih sesuai daftar:\n${msgList}`
        );
        return;
      }
    }
    if (field === "insta") {
      const igMatch = value.match(
        /^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?(\?.*)?$/i
      );
      if (!igMatch) {
        await waClient.sendMessage(
          chatId,
          "❌ Link tersebut bukan *link profil Instagram*! Masukkan *link profil Instagram* (contoh: https://www.instagram.com/username)"
        );
        return;
      }
      value = igMatch[2].toLowerCase();
      const existing = await userModel.findUserByInsta(value);
      if (existing && existing.user_id !== user_id) {
        await waClient.sendMessage(
          chatId,
          "❌ Akun Instagram tersebut sudah terdaftar pada pengguna lain."
        );
        return;
      }
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
    if (["nama", "title", "divisi", "jabatan", "desa"].includes(field)) value = value.toUpperCase();

    await userModel.updateUserField(user_id, field, value);
    if (field === "whatsapp" && value) {
      await saveContactIfNew(formatToWhatsAppId(value));
    }
    await waClient.sendMessage(
      chatId,
      `✅ Data *${
        field === "title"
          ? "pangkat"
          : field === "divisi"
          ? "satfung"
          : field === "desa"
          ? "desa binaan"
          : field
      }* untuk NRP ${user_id} berhasil diupdate menjadi *${value}*.`
    );
    delete session.availableTitles;
    delete session.availableSatfung;
    await userMenuHandlers.main(session, chatId, "", waClient, pool, userModel);
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
      session.exit = true;
      await waClient.sendMessage(chatId, "Terima kasih. Ketik *userrequest* bila membutuhkan lagi.");
      return;
    }
    await waClient.sendMessage(
      chatId,
      "Balas *ya* jika ingin update data, atau *tidak* untuk kembali."
    );
  },
};
