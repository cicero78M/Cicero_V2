import * as userModel from '../model/userModel.js';
import { sendSuccess } from '../utils/response.js';
import { normalizeUserId, normalizeEmail } from '../utils/utilsHelper.js';
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
    const { nrp: rawNrp, email } = req.body;
    const nrp = normalizeUserId(rawNrp);
    if (!nrp || !email) {
      return res.status(400).json({ success: false, message: 'nrp dan email wajib diisi' });
    }
    const em = normalizeEmail(email);
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
    if (user.email) {
      const storedEmail = normalizeEmail(user.email);
      if (storedEmail !== em) {
        return res.status(400).json({ success: false, message: 'email tidak sesuai' });
      }
    }
    const otp = await generateOtp(nrp, em);
    try {
      await enqueueOtp(em, otp);
    } catch (err) {
      console.warn(`[OTP] Failed to enqueue OTP for ${em}: ${err.message}`);
      const status = isConnectionError(err) ? 503 : 502;
      return res
        .status(status)
        .json({ success: false, message: 'Gagal mengirim OTP' });
    }
    sendSuccess(res, { message: 'OTP akan dikirim sesaat lagi' }, 202);
  } catch (err) {
    next(err);
  }
}

export async function verifyOtpController(req, res, next) {
  try {
    const { nrp: rawNrp, email, otp } = req.body;
    const nrp = normalizeUserId(rawNrp);
    if (!nrp || !email || !otp) {
      return res.status(400).json({ success: false, message: 'nrp, email, dan otp wajib diisi' });
    }
    const em = normalizeEmail(email);
    const valid = await verifyOtp(nrp, em, otp);
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
    if (!user) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
    if (user && !user.email) {
      await userModel.updateUserField(nrp, 'email', em);
    }
    sendSuccess(res, { verified: true });
  } catch (err) {
    next(err);
  }
}

export async function getUserData(req, res, next) {
  try {
    const { nrp: rawNrp, email } = req.body;
    const nrp = normalizeUserId(rawNrp);
    if (!nrp || !email) {
      return res
        .status(400)
        .json({ success: false, message: 'nrp dan email wajib diisi' });
    }
    const em = normalizeEmail(email);
    if (!(await isVerified(nrp, em))) {
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
      email,
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
    if (!nrp || !email) {
      return res.status(400).json({ success: false, message: 'nrp dan email wajib diisi' });
    }
    const em = normalizeEmail(email);
    let verified = await isVerified(nrp, em);
    if (!verified && otp) {
      verified = await verifyOtp(nrp, em, otp);
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
