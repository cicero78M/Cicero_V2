import * as userModel from '../model/userModel.js';
import { sendSuccess } from '../utils/response.js';
import { formatToWhatsAppId, normalizeWhatsappNumber, safeSendMessage } from '../utils/waHelper.js';
import waClient, { waitForWaReady } from '../service/waService.js';
import { generateOtp, verifyOtp, isVerified, clearVerification } from '../service/otpService.js';

export async function requestOtp(req, res, next) {
  try {
    const { nrp, whatsapp } = req.body;
    if (!nrp || !whatsapp) {
      return res.status(400).json({ success: false, message: 'nrp dan whatsapp wajib diisi' });
    }
    const wa = normalizeWhatsappNumber(whatsapp);
    const user = await userModel.findUserById(nrp);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
    if (user.whatsapp && user.whatsapp !== wa) {
      return res.status(400).json({ success: false, message: 'whatsapp tidak sesuai' });
    }
    const otp = generateOtp(nrp, wa);
    try {
      await waitForWaReady();
      const wid = formatToWhatsAppId(wa);
      await safeSendMessage(waClient, wid, `Kode OTP Anda: ${otp}`);
    } catch (err) {
      console.warn(`[WA] Failed to send OTP to ${wa}: ${err.message}`);
    }
    sendSuccess(res, { message: 'OTP dikirim' });
  } catch (err) {
    next(err);
  }
}

export async function verifyOtpController(req, res, next) {
  try {
    const { nrp, whatsapp, otp } = req.body;
    if (!nrp || !whatsapp || !otp) {
      return res.status(400).json({ success: false, message: 'nrp, whatsapp, dan otp wajib diisi' });
    }
    const wa = normalizeWhatsappNumber(whatsapp);
    const valid = verifyOtp(nrp, wa, otp);
    if (!valid) {
      return res.status(400).json({ success: false, message: 'OTP tidak valid' });
    }
    const user = await userModel.findUserById(nrp);
    if (user && !user.whatsapp) {
      await userModel.updateUserField(nrp, 'whatsapp', wa);
    }
    sendSuccess(res, { verified: true });
  } catch (err) {
    next(err);
  }
}

export async function updateUserData(req, res, next) {
  try {
    const { nrp, whatsapp, nama, title, divisi, jabatan, desa, insta, tiktok } = req.body;
    if (!nrp || !whatsapp) {
      return res.status(400).json({ success: false, message: 'nrp dan whatsapp wajib diisi' });
    }
    const wa = normalizeWhatsappNumber(whatsapp);
    if (!isVerified(nrp, wa)) {
      return res.status(403).json({ success: false, message: 'OTP belum diverifikasi' });
    }
    const data = { nama, title, divisi, jabatan, desa, insta, tiktok };
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    const updated = await userModel.updateUser(nrp, data);
    clearVerification(nrp);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}
