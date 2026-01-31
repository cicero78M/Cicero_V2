// src/controller/complaintController.js
import * as userModel from "../model/userModel.js";
import { sendSuccess } from "../utils/response.js";
import { formatNama, getGreeting, normalizeUserId } from "../utils/utilsHelper.js";

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function resolveIssueText(body, platformLabel) {
  const issue =
    normalizeText(body.issue) ||
    normalizeText(body.kendala) ||
    normalizeText(body.problem);
  if (issue) return issue;
  return `Belum ada rincian kendala untuk komplain ${platformLabel}.`;
}

function resolveSolutionText(body, platformLabel) {
  const solution =
    normalizeText(body.solution) ||
    normalizeText(body.solusi) ||
    normalizeText(body.tindak_lanjut);
  if (solution) return solution;
  return [
    `Tim kami sedang menindaklanjuti laporan ${platformLabel}.`,
    "Jika diperlukan, kami akan menghubungi kembali setelah pengecekan.",
  ].join(" ");
}

function buildComplaintMessage({ reporterName, nrp, issue, solution }) {
  const salam = getGreeting();
  return [
    `${salam}! Kami menindaklanjuti laporan yang Anda sampaikan.`,
    `\n*Pelapor*: ${reporterName}`,
    `\n*NRP/NIP*: ${nrp}`,
    `\n*Kendala*:`,
    issue,
    `\n\n*Solusi/Tindak Lanjut*:`,
    solution,
  ]
    .join("\n")
    .trim();
}

async function handleComplaint(req, res, platformLabel) {
  const rawNrp = req.body?.nrp;
  const nrp = normalizeUserId(rawNrp);
  if (!nrp) {
    return res
      .status(400)
      .json({ success: false, message: "nrp wajib diisi" });
  }

  const user = await userModel.findUserById(nrp);
  if (!user) {
    return res
      .status(404)
      .json({ success: false, message: "User tidak ditemukan" });
  }

  const reporterName = formatNama(user) || user.nama || nrp;
  const issue = resolveIssueText(req.body || {}, platformLabel);
  const solution = resolveSolutionText(req.body || {}, platformLabel);

  const message = buildComplaintMessage({ reporterName, nrp, issue, solution });
  const dashboardWhatsapp = req.dashboardUser?.whatsapp || null;
  const channel = user?.whatsapp
    ? "whatsapp"
    : user?.email
    ? "email"
    : "unknown";

  sendSuccess(res, {
    platform: platformLabel,
    message,
    issue,
    solution,
    channel,
    reporter: {
      nrp,
      name: reporterName,
      whatsapp: user?.whatsapp || null,
      email: user?.email || null,
    },
    dashboard: {
      whatsapp: dashboardWhatsapp,
    },
  });
}

export async function postComplaintInstagram(req, res, next) {
  try {
    await handleComplaint(req, res, "Instagram");
  } catch (err) {
    next(err);
  }
}

export async function postComplaintTiktok(req, res, next) {
  try {
    await handleComplaint(req, res, "TikTok");
  } catch (err) {
    next(err);
  }
}
