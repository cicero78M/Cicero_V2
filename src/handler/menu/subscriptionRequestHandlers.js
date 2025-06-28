// src/handler/menu/subscriptionRequestHandlers.js
import { getAdminWAIds } from '../../utils/waHelper.js';
import * as registrationService from '../../service/subscriptionRegistrationService.js';

export const subscriptionRequestHandlers = {
  main: async (session, chatId, text, waClient) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = null;
      return waClient.sendMessage(chatId, '❎ Permintaan dibatalkan.');
    }
    const nrp = text.trim().replace(/[^0-9a-zA-Z]/g, '');
    if (!nrp) {
      return waClient.sendMessage(chatId, 'Masukkan *NRP/NIP* yang valid:');
    }
    session.user_id = nrp;
    session.step = 'namaRekening';
    await waClient.sendMessage(chatId, 'Masukkan *Nama Rekening*:');
  },
  namaRekening: async (session, chatId, text, waClient) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = null;
      return waClient.sendMessage(chatId, '❎ Permintaan dibatalkan.');
    }
    session.nama_rekening = text.trim();
    session.step = 'nomorRekening';
    await waClient.sendMessage(chatId, 'Masukkan *Nomor Rekening*:');
  },
  nomorRekening: async (session, chatId, text, waClient) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = null;
      return waClient.sendMessage(chatId, '❎ Permintaan dibatalkan.');
    }
    session.nomor_rekening = text.trim();
    session.step = 'phone';
    await waClient.sendMessage(chatId, 'Masukkan *Nomor Telepon* (WhatsApp):');
  },
  phone: async (session, chatId, text, waClient) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = null;
      return waClient.sendMessage(chatId, '❎ Permintaan dibatalkan.');
    }
    session.phone = text.trim();
    session.step = 'amount';
    await waClient.sendMessage(chatId, 'Masukkan *Nominal Pembayaran*:');
  },
  amount: async (session, chatId, text, waClient) => {
    if (/^(batal|cancel|exit)$/i.test(text.trim())) {
      session.step = null;
      return waClient.sendMessage(chatId, '❎ Permintaan dibatalkan.');
    }
    const amount = parseInt(text.replace(/\D/g, ''), 10);
    if (!amount) {
      return waClient.sendMessage(chatId, 'Nominal tidak valid, masukkan angka:');
    }
    session.amount = amount;
    session.step = 'confirm';
    let msg = '*Konfirmasi Pendaftaran Premium*\n';
    msg += `NRP/NIP : *${session.user_id}*\n`;
    msg += `Nama Rekening : *${session.nama_rekening}*\n`;
    msg += `Nomor Rekening : *${session.nomor_rekening}*\n`;
    msg += `Telepon : *${session.phone}*\n`;
    msg += `Nominal : *${session.amount}*\n`;
    msg += '\nBalas *ya* untuk mengirim atau *batal* untuk membatalkan.';
    await waClient.sendMessage(chatId, msg);
  },
  confirm: async (session, chatId, text, waClient) => {
    const ans = text.trim().toLowerCase();
    if (ans === 'batal' || ans === 'tidak' || ans === 'no') {
      session.step = null;
      return waClient.sendMessage(chatId, '❎ Permintaan dibatalkan.');
    }
    if (ans !== 'ya') {
      return waClient.sendMessage(chatId, 'Balas *ya* untuk konfirmasi atau *batal* untuk membatalkan.');
    }
    const reg = await registrationService.createRegistration({
      user_id: session.user_id,
      nama_rekening: session.nama_rekening,
      nomor_rekening: session.nomor_rekening,
      phone: session.phone,
      amount: session.amount,
    });
    await waClient.sendMessage(chatId, '✅ Permintaan Anda telah dikirim ke admin.');
    const adminIds = getAdminWAIds();
    let notif = '*Permintaan Subscription Premium*\n';
    notif += `ID Permintaan: *${reg.registration_id}*\n`;
    notif += `NRP/NIP : *${reg.user_id}*\n`;
    notif += `Nominal : *${reg.amount}*\n`;
    notif += `Balas *GRANTSUB#${reg.registration_id}* untuk memberi akses atau *DENYSUB#${reg.registration_id}* untuk menolak.`;
    for (const adminId of adminIds) {
      await waClient.sendMessage(adminId, notif);
    }
    session.step = null;
  },
};

