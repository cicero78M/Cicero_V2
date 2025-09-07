import * as userModel from '../model/userModel.js';
import { sendSuccess } from '../utils/response.js';
import { normalizeWhatsappNumber } from '../utils/waHelper.js';
import { normalizeUserId } from '../utils/utilsHelper.js';
import { enqueueOtp } from '../service/otpQueue.js';
import { generateOtp, verifyOtp, isVerified, clearVerification } from '../service/otpService.js';

function isConnectionError(err) {
  return err && err.code === 'ECONNREFUSED';
}

function extractInstagramUsername(value) {
  if (!value) return undefined;
  const match = value.match(
    /^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?(\?.*)?$/i
  );
  const username = match ? match[2] : value.replace(/^@/, '');
  return username.toLowerCase();
}

function extractTiktokUsername(value) {
  if (!value) return undefined;
  const match = value.match(
    /^https?:\/\/(www\.)?tiktok\.com\/@([A-Za-z0-9._]+)\/?(\?.*)?$/i
  );
  const username = match ? match[2] : value.replace(/^@/, '');
  return username ? `@${username.toLowerCase()}` : undefined;
}

export async function requestOtp(req, res, next) {
  try {
    const { nrp: rawNrp, whatsapp } = req.body;
    const nrp = normalizeUserId(rawNrp);
    if (!nrp || !whatsapp) {
      return res.status(400).json({ success: false, message: 'nrp dan whatsapp wajib diisi' });
    }
    const wa = normalizeWhatsappNumber(whatsapp);
    let user;
    try {
      user = await userModel.findUserById(nrp);
    } catch (err) {
      if (isConnectionError(err)) {
        return res.status(503).json({ success: false, message: 'Database tidak tersedia' });
      }
      throw err;
    }
    if (!user) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
    if (user.whatsapp) {
      const storedWa = normalizeWhatsappNumber(user.whatsapp);
      if (storedWa !== wa) {
        return res.status(400).json({ success: false, message: 'whatsapp tidak sesuai' });
      }
    }
    const otp = await generateOtp(nrp, wa);
    enqueueOtp(wa, otp).catch((err) =>
      console.warn(`[OTP] Failed to enqueue OTP for ${wa}: ${err.message}`)
    );
    sendSuccess(res, { message: 'OTP akan dikirim sesaat lagi' }, 202);
  } catch (err) {
    next(err);
  }
}

export async function verifyOtpController(req, res, next) {
  try {
    const { nrp: rawNrp, whatsapp, otp } = req.body;
    const nrp = normalizeUserId(rawNrp);
    if (!nrp || !whatsapp || !otp) {
      return res.status(400).json({ success: false, message: 'nrp, whatsapp, dan otp wajib diisi' });
    }
    const wa = normalizeWhatsappNumber(whatsapp);
    const valid = await verifyOtp(nrp, wa, otp);
    if (!valid) {
      return res.status(400).json({ success: false, message: 'OTP tidak valid' });
    }
    let user;
    try {
      user = await userModel.findUserById(nrp);
    } catch (err) {
      if (isConnectionError(err)) {
        return res.status(503).json({ success: false, message: 'Database tidak tersedia' });
      }
      throw err;
    }
    if (user && !user.whatsapp) {
      await userModel.updateUserField(nrp, 'whatsapp', wa);
    }
    sendSuccess(res, { verified: true });
  } catch (err) {
    next(err);
  }
}

export async function getUserData(req, res, next) {
  try {
    const { nrp: rawNrp, whatsapp } = req.body;
    const nrp = normalizeUserId(rawNrp);
    if (!nrp || !whatsapp) {
      return res
        .status(400)
        .json({ success: false, message: 'nrp dan whatsapp wajib diisi' });
    }
    const wa = normalizeWhatsappNumber(whatsapp);
    if (!(await isVerified(nrp, wa))) {
      return res
        .status(403)
        .json({ success: false, message: 'OTP belum diverifikasi' });
    }
    let user;
    try {
      user = await userModel.findUserById(nrp);
    } catch (err) {
      if (isConnectionError(err)) {
        return res
          .status(503)
          .json({ success: false, message: 'Database tidak tersedia' });
      }
      throw err;
    }
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: 'User tidak ditemukan' });
    }
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

export async function updateUserData(req, res, next) {
  try {
    const {
      nrp: rawNrp,
      whatsapp,
      nama,
      title,
      divisi,
      jabatan,
      desa,
      insta,
      tiktok,
      otp,
    } = req.body;
    const nrp = normalizeUserId(rawNrp);
    if (!nrp || !whatsapp) {
      return res.status(400).json({ success: false, message: 'nrp dan whatsapp wajib diisi' });
    }
    const wa = normalizeWhatsappNumber(whatsapp);
    let verified = await isVerified(nrp, wa);
    if (!verified && otp) {
      verified = await verifyOtp(nrp, wa, otp);
    }
    if (!verified) {
      return res.status(403).json({ success: false, message: 'OTP belum diverifikasi' });
    }
    const data = { nama, title, divisi, jabatan, desa };
    if (insta !== undefined) {
      const igUsername = extractInstagramUsername(insta);
      if (igUsername === 'cicero_devs') {
        return res
          .status(400)
          .json({ success: false, message: 'username instagram tidak valid' });
      }
      data.insta = igUsername;
    }
  if (tiktok !== undefined) {
    const ttUsername = extractTiktokUsername(tiktok);
    if (ttUsername && ttUsername.replace(/^@/, '') === 'cicero_devs') {
      return res
        .status(400)
        .json({ success: false, message: 'username tiktok tidak valid' });
    }
    data.tiktok = ttUsername;
  }
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    const updated = await userModel.updateUser(nrp, data);
    await clearVerification(nrp);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}
