import * as userModel from '../model/userModel.js';
import { sendSuccess } from '../utils/response.js';
import { normalizeUserId, normalizeEmail } from '../utils/utilsHelper.js';
import { enqueueOtp } from '../service/otpQueue.js';
import {
  generateOtp,
  verifyOtp,
  isVerified,
  refreshVerification,
} from '../service/otpService.js';
import dns from 'dns/promises';

function isConnectionError(err) {
  return err && err.code === 'ECONNREFUSED';
}

function isEmailFormatValid(email) {
  if (!email || email.length > 254) return false;
  const normalized = normalizeEmail(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized)) return false;
  const [localPart, domain] = normalized.split('@');
  if (!localPart || !domain) return false;
  if (localPart.length < 2 || localPart.length > 64) return false;
  if (domain.length < 3 || domain.length > 190) return false;
  if (domain.includes('..') || localPart.includes('..')) return false;
  return domain.includes('.');
}

function extractInstagramUsername(value) {
  if (!value) return undefined;
  const trimmed = value.trim();
  const match = trimmed.match(
    /^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?(\?.*)?$/i
  );
  const username = match ? match[2] : trimmed.replace(/^@/, '');
  const normalized = username?.toLowerCase();
  if (!normalized || !/^[a-z0-9._]{1,30}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function extractTiktokUsername(value) {
  if (!value) return undefined;
  const trimmed = value.trim();
  const match = trimmed.match(
    /^https?:\/\/(www\.)?tiktok\.com\/@([A-Za-z0-9._]+)\/?(\?.*)?$/i
  );
  const username = match ? match[2] : trimmed.replace(/^@/, '');
  const normalized = username?.toLowerCase();
  if (!normalized || !/^[a-z0-9._]{1,24}$/.test(normalized)) {
    return null;
  }
  return `@${normalized}`;
}

const INACTIVE_DOMAIN_ERRORS = ['ENODATA', 'ENOTFOUND', 'NXDOMAIN', 'ENONAME'];
const DNS_UNAVAILABLE_ERRORS = ['EAI_AGAIN', 'ETIMEOUT', 'EAI_FAIL', 'ECONNREFUSED', 'SERVFAIL'];

async function hasActiveEmailDomain(domain) {
  try {
    const mxRecords = await dns.resolveMx(domain);
    return Array.isArray(mxRecords) && mxRecords.length > 0;
  } catch (err) {
    if (INACTIVE_DOMAIN_ERRORS.includes(err.code)) {
      return false;
    }
    if (DNS_UNAVAILABLE_ERRORS.includes(err.code)) {
      const dnsError = new Error('DNS lookup unavailable');
      dnsError.code = err.code;
      throw dnsError;
    }
    throw err;
  }
}

export async function validateEmail(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email wajib diisi' });
    }
    const normalized = normalizeEmail(email);
    if (!isEmailFormatValid(normalized)) {
      return res.status(400).json({
        success: false,
        message: 'Format email tidak valid. Pastikan menulis alamat lengkap seperti nama@contoh.com',
      });
    }

    const [, domain] = normalized.split('@');
    let domainActive = false;
    try {
      domainActive = await hasActiveEmailDomain(domain);
    } catch (err) {
      if (DNS_UNAVAILABLE_ERRORS.includes(err.code)) {
        return res.status(503).json({
          success: false,
          message: 'Layanan validasi email tidak tersedia. Coba beberapa saat lagi.',
        });
      }
      throw err;
    }

    if (!domainActive) {
      return res.status(400).json({
        success: false,
        message: 'Email tidak dapat digunakan. Domain email tidak aktif atau tidak menerima email.',
      });
    }

    let existingUser;
    try {
      existingUser = await userModel.findUserByEmail(normalized);
    } catch (err) {
      if (isConnectionError(err)) {
        return res.status(503).json({ success: false, message: 'Database tidak tersedia' });
      }
      throw err;
    }

    if (existingUser && existingUser.status === false) {
      return res
        .status(403)
        .json({ success: false, message: 'Email tidak aktif. Hubungi admin untuk mengaktifkan kembali.' });
    }

    sendSuccess(res, { message: 'Email valid dan bisa digunakan' });
  } catch (err) {
    next(err);
  }
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
      try {
        const existingEmailUser = await userModel.findUserByEmail(em);
        if (existingEmailUser) {
          const ownerId = normalizeUserId(existingEmailUser.user_id);
          if (ownerId && ownerId === nrp) {
            user = existingEmailUser;
          } else {
            return res.status(409).json({
              success: false,
              message:
                'Email sudah dipakai akun lain. Gunakan email berbeda atau hubungi admin untuk memperbaiki data.',
            });
          }
        }
      } catch (err) {
        if (isConnectionError(err)) {
          return res.status(503).json({ success: false, message: 'Database tidak tersedia' });
        }
        throw err;
      }
      if (!user) {
        return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
      }
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
    let igUsername;
    if (insta !== undefined) {
      igUsername = extractInstagramUsername(insta);
      if (igUsername === null) {
        return res.status(400).json({
          success: false,
          message:
            'Format username Instagram tidak valid. Gunakan tautan profil atau username seperti instagram.com/username atau @username.',
        });
      }
    }
    let ttUsername;
    if (tiktok !== undefined) {
      ttUsername = extractTiktokUsername(tiktok);
      if (ttUsername === null) {
        return res.status(400).json({
          success: false,
          message:
            'Format username TikTok tidak valid. Gunakan tautan profil atau username seperti tiktok.com/@username atau @username.',
        });
      }
    }
    let verified = await isVerified(nrp, em);
    if (!verified && otp) {
      verified = await verifyOtp(nrp, em, otp);
    }
    if (!verified) {
      return res.status(403).json({ success: false, message: 'OTP belum diverifikasi' });
    }
    const data = { nama, title, divisi, jabatan, desa };
    if (insta !== undefined) {
      if (igUsername === 'cicero_devs') {
        return res
          .status(400)
          .json({ success: false, message: 'username instagram tidak valid' });
      }
      data.insta = igUsername;
    }
    if (tiktok !== undefined) {
      if (ttUsername && ttUsername.replace(/^@/, '') === 'cicero_devs') {
        return res
          .status(400)
          .json({ success: false, message: 'username tiktok tidak valid' });
      }
      data.tiktok = ttUsername;
    }
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    const updated = await userModel.updateUser(nrp, data);
    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: 'User tidak ditemukan' });
    }
    try {
      await refreshVerification(nrp, em);
    } catch (err) {
      console.warn(
        `[OTP] Failed to refresh verification for ${nrp}: ${err?.message ?? err}`
      );
    }
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}
