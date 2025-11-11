// src/handler/menu/clientRequestHandlers.js

import { handleFetchLikesInstagram } from "../fetchengagement/fetchLikesInstagram.js";
import {
  formatClientInfo,
  groupByDivision,
  sortDivisionKeys,
  formatNama,
  normalizeUserId,
  normalizeEmail,
  getGreeting,
  formatUserData,
  formatComplaintIssue,
} from "../../utils/utilsHelper.js";
import { normalizeHandleValue } from "../../utils/handleNormalizer.js";
import { absensiRegistrasiDashboardDitbinmas } from "../fetchabsensi/dashboard/absensiRegistrasiDashboardDitbinmas.js";
import {
  getAdminWANumbers,
  getAdminWAIds,
  sendWAFile,
  safeSendMessage,
} from "../../utils/waHelper.js";
import * as linkReportModel from "../../model/linkReportModel.js";
import { saveLinkReportExcel } from "../../service/linkReportExcelService.js";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { mdToPdf } from "md-to-pdf";
import { query } from "../../db/index.js";
import { saveContactIfNew } from "../../service/googleContactsService.js";
import { formatToWhatsAppId } from "../../utils/waHelper.js";
import { fetchInstagramInfo } from "../../service/instaRapidService.js";
import { fetchTiktokProfile } from "../../service/tiktokRapidService.js";
import { hasUserLikedBetween } from "../../model/instaLikeModel.js";
import { hasUserCommentedBetween } from "../../model/tiktokCommentModel.js";
import { sendComplaintEmail } from "../../service/emailService.js";

function ignore(..._args) {}

async function sendComplaintResponse(session, waClient) {
  const data = session.respondComplaint || {};
  const { nrp, user, issue, solution, channel: storedChannel } = data;

  if (!nrp || !user || !issue || !solution) {
    throw new Error("Data komplain tidak lengkap.");
  }

  const salam = getGreeting();
  const reporterName = formatNama(user) || user.nama || nrp;
  const message = [
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

  const whatsappNumber = user?.whatsapp ? String(user.whatsapp).trim() : "";
  const normalizedEmail = normalizeEmail(user?.email);
  const channel =
    storedChannel ||
    (whatsappNumber
      ? "whatsapp"
      : normalizedEmail
      ? "email"
      : "");

  if (channel === "whatsapp") {
    const target = formatToWhatsAppId(whatsappNumber);
    await safeSendMessage(waClient, target, message);
  } else if (channel === "email") {
    if (!normalizedEmail) {
      throw new Error("Email pelapor tidak tersedia.");
    }
    const subject = `Tindak Lanjut Laporan Cicero - ${reporterName}`;
    await sendComplaintEmail(normalizedEmail, subject, message);
  } else {
    throw new Error("Kanal pengiriman respon tidak tersedia.");
  }

  return { reporterName, nrp, channel };
}

const numberFormatter = new Intl.NumberFormat("id-ID");
const UPDATE_DATA_LINK = "https://papiqo.com/claim";
const ACTIVITY_START_DATE = "2025-09-01";
const ID_DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatNumber(value) {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return numberFormatter.format(num);
}

function formatIdDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return ID_DATE_FORMATTER.format(date);
}

function buildRecordedActivitySolution({
  issueText,
  platform,
  activityVerb,
  handle,
  activityCount,
  startDate = ACTIVITY_START_DATE,
  endDate = new Date(),
}) {
  const decoratedHandle = handle ? `*${handle}*` : "akun tersebut";
  const startLabel = formatIdDate(startDate) || formatIdDate(ACTIVITY_START_DATE) || "1 September 2025";
  const endLabel = formatIdDate(endDate) || formatIdDate(new Date());
  const activitySummary = formatNumber(activityCount);
  const platformMenuInfo =
    platform === "Instagram"
      ? {
          menu: "*Absensi Amplifikasi*",
          refreshInstruction:
            "Buka menu tersebut di dashboard Cicero, pilih ulang filter satker/periode lalu tekan tombol *Refresh* untuk memuat riwayat terbaru.",
        }
      : {
          menu: "*Absensi Komentar*",
          refreshInstruction:
            "Buka menu tersebut di dashboard Cicero, pilih ulang filter satker/periode kemudian klik *Refresh* atau muat ulang riwayat tugasnya.",
        };
  const lines = [
    `Ringkasan pengecekan: akun ${decoratedHandle} tercatat ${activityVerb} pada ${activitySummary} konten ${platform} dalam periode ${startLabel} hingga ${endLabel}.`,
    "Sistem Cicero tidak menemukan gangguan pencatatan untuk aktivitas tersebut.",
    "",
    `Menu dashboard yang perlu dicek: ${platformMenuInfo.menu}. ${platformMenuInfo.refreshInstruction}`,
    "Bila data tetap belum muncul, minta personel mengirim tangkapan layar hasil refresh dan hubungi operator piket untuk pendampingan lebih lanjut.",
  ];
  return lines.join("\n").trim();
}

function isZeroMetric(value) {
  if (value === null || value === undefined) return false;
  const num = Number(value);
  if (Number.isNaN(num)) return false;
  return num === 0;
}

function buildSuspiciousAccountNote(platform, handle) {
  const decoratedHandle = handle ? `*${handle}*` : "tersebut";
  if (platform === "instagram") {
    return [
      "⚠️ Catatan Instagram",
      `Akun ${decoratedHandle} terlihat tanpa aktivitas (posting, pengikut, dan mengikuti semuanya 0).`,
      "Mohon periksa langsung di aplikasi Instagram untuk memastikan username benar dan akun masih aktif.",
    ].join("\n");
  }
  return [
    "⚠️ Catatan TikTok",
    `Akun ${decoratedHandle} terlihat tanpa aktivitas (video, pengikut, dan mengikuti semuanya 0 dengan jumlah likes tidak tersedia).`,
    "Mohon cek ulang di aplikasi TikTok guna memastikan username valid atau akun tidak sedang dibatasi.",
  ].join("\n");
}

function ensureHandle(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

const BULK_STATUS_HEADER_REGEX = /Permohonan Penghapusan Data Personil/i;
const NUMERIC_ID_REGEX = /\b\d{6,}\b/g;

function standardizeDash(value) {
  return value
    .replace(/[\u2012-\u2015]/g, "-")
    .replace(/[•●▪]/g, "-");
}

function extractNameAndReason(segment) {
  const trimmed = segment.trim();
  const match = trimmed.match(/^(?<reason>[^()]+?)\s*\((?<name>.+?)\)$/);
  if (match?.groups) {
    const { reason, name } = match.groups;
    return {
      name: name.trim(),
      reason: reason.trim(),
    };
  }
  return { name: trimmed, reason: "" };
}

function extractNarrativeSentence(text, index) {
  let start = index;
  while (start > 0) {
    const char = text[start - 1];
    if (char === "\n" || char === "!" || char === "?" || char === ".") {
      break;
    }
    start -= 1;
  }

  let end = index;
  while (end < text.length) {
    const char = text[end];
    if (char === "\n" || char === "!" || char === "?" || char === ".") {
      break;
    }
    end += 1;
  }

  return text.slice(start, end).trim();
}

function cleanReasonText(text) {
  if (!text) return "";
  return text
    .replace(/\b(?:nrp|nip)\b.*$/i, "")
    .replace(NUMERIC_ID_REGEX, "")
    .replace(/^[\s,:;\-]+/, "")
    .replace(/[\s,:;\-]+$/, "")
    .trim();
}

function extractNarrativeReason(sentence, rawId) {
  const normalized = sentence.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const keywordRegex = /\b(karena|alasan)\b\s*[:\-]?\s*/i;
  const keywordMatch = keywordRegex.exec(normalized);
  if (keywordMatch) {
    const start = keywordMatch.index + keywordMatch[0].length;
    const remainder = normalized.slice(start).trim();
    const boundaryMatch = remainder.match(/^[^.!?\n]+/);
    const extracted = boundaryMatch ? boundaryMatch[0] : remainder;
    const cleaned = cleanReasonText(extracted);
    if (cleaned) return cleaned;
  }

  const idIndex = normalized.indexOf(rawId);
  if (idIndex !== -1) {
    const afterId = normalized.slice(idIndex + rawId.length).trim();
    const afterDashMatch = afterId.match(/^[-:–—]\s*([^.!?\n]+)/);
    if (afterDashMatch) {
      const cleaned = cleanReasonText(afterDashMatch[1]);
      if (cleaned) return cleaned;
    }
  }

  const dashMatch = normalized.match(/[-:–—]\s*([^.!?\n]+)$/);
  if (dashMatch) {
    const cleaned = cleanReasonText(dashMatch[1]);
    if (cleaned) return cleaned;
  }

  if (keywordMatch) {
    const start = keywordMatch.index + keywordMatch[0].length;
    const remainder = normalized.slice(start).trim();
    const cleaned = cleanReasonText(remainder);
    if (cleaned) return cleaned;
  }

  return "";
}

function extractNarrativeName(sentence, rawId) {
  const normalized = sentence.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const idIndex = normalized.indexOf(rawId);
  if (idIndex === -1) return "";

  const beforeId = normalized.slice(0, idIndex).trim();
  const afterId = normalized.slice(idIndex + rawId.length).trim();

  const parenAfter = afterId.match(/^\(([^)]+)\)/);
  if (parenAfter) return parenAfter[1].trim();

  const parenBefore = beforeId.match(/\(([^)]+)\)\s*$/);
  if (parenBefore) return parenBefore[1].trim();

  const atasNamaMatch = beforeId.match(/\b(?:atas nama|a\.n\.|a\.n|an\.)\s+(.+)$/i);
  if (atasNamaMatch) {
    return cleanReasonText(atasNamaMatch[1]);
  }

  let nameCandidate = beforeId;
  const nrpIndex = nameCandidate.toLowerCase().lastIndexOf("nrp");
  const nipIndex = nameCandidate.toLowerCase().lastIndexOf("nip");
  const indexToCut = Math.max(nrpIndex, nipIndex);
  if (indexToCut !== -1) {
    nameCandidate = nameCandidate.slice(0, indexToCut).trim();
  }

  nameCandidate = nameCandidate.replace(/[-:]+$/, "").trim();
  if (!nameCandidate) return "";

  const fillerWords = new Set([
    "mohon",
    "tolong",
    "harap",
    "agar",
    "untuk",
    "personel",
    "personil",
    "nonaktifkan",
    "nonaktif",
    "dinonaktifkan",
    "user",
    "dengan",
    "nomor",
    "nrp",
    "nip",
    "id",
    "atas",
    "nama",
  ]);

  const words = nameCandidate.split(/\s+/).filter(Boolean);
  const meaningful = [];
  for (let i = words.length - 1; i >= 0; i -= 1) {
    const word = words[i];
    if (!word) continue;
    if (meaningful.length === 0 && fillerWords.has(word.toLowerCase())) {
      continue;
    }
    meaningful.push(word);
  }
  meaningful.reverse();
  const reconstructed = meaningful.join(" ").trim();
  return reconstructed;
}

function parseBulkStatusEntries(message) {
  const standardized = standardizeDash(message);
  const lines = standardized.split(/\r?\n/);
  const entries = [];
  const knownIds = new Set();
  const entryRegex = /^\s*(\d+)\.\s+(.+?)\s+-\s+(.+?)\s+-\s+(.+)$/;
  const fallbackRegex = /^\s*(\d+)\.\s+(.+?)\s+-\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(entryRegex);
    if (match) {
      const [, index, name, rawId, reason] = match;
      entries.push({
        index: Number(index),
        name: name.trim(),
        rawId: rawId.trim(),
        reason: reason.trim(),
        line: line.trim(),
      });
      knownIds.add(rawId.trim());
      continue;
    }

    const fallbackMatch = line.match(fallbackRegex);
    if (!fallbackMatch) continue;

    const [, index, firstSegment, rawId] = fallbackMatch;
    const { name, reason } = extractNameAndReason(firstSegment);

    entries.push({
      index: Number(index),
      name,
      rawId: rawId.trim(),
      reason,
      line: line.trim(),
    });
    knownIds.add(rawId.trim());
  }

  let nextIndex = entries.reduce((max, entry) => Math.max(max, entry.index || 0), 0) + 1;

  const matches = standardized.matchAll(NUMERIC_ID_REGEX);
  for (const match of matches) {
    const rawId = match[0];
    if (knownIds.has(rawId)) continue;

    const sentence = extractNarrativeSentence(standardized, match.index);
    if (!sentence) continue;

    const reason = extractNarrativeReason(sentence, rawId);
    const name = extractNarrativeName(sentence, rawId);

    entries.push({
      index: nextIndex,
      name,
      rawId,
      reason,
      line: sentence.trim(),
    });
    knownIds.add(rawId);
    nextIndex += 1;
  }

  const headerLine =
    lines.find((line) => BULK_STATUS_HEADER_REGEX.test(line))?.trim() || "";

  return { entries, headerLine };
}

function isUserActive(user) {
  if (!user) return false;
  const { status } = user;
  if (status === null || status === undefined) {
    return true;
  }
  if (typeof status === "string") {
    const normalized = status.trim().toLowerCase();
    return ["true", "1", "aktif"].includes(normalized);
  }
  if (typeof status === "number") {
    return status === 1;
  }
  return Boolean(status);
}

function toPositiveNumber(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) return null;
  return num > 0 ? num : null;
}

function hasFullMetrics(status, keys = ["posts", "followers", "following"]) {
  if (!status) return false;
  return keys.every((key) => toPositiveNumber(status[key]) !== null);
}

function appendUpdateInstructions(target, platformLabel) {
  target.push(buildUpdateDataInstructions(platformLabel));
  target.push(`Tautan update data personel: ${UPDATE_DATA_LINK}`);
}

function pickPrimaryRole(user) {
  if (!user) return null;
  if (user.ditbinmas) return "ditbinmas";
  if (user.ditlantas) return "ditlantas";
  if (user.bidhumas) return "bidhumas";
  if (user.operator) return "operator";
  return null;
}

function shortenCaption(text, max = 120) {
  if (!text) return "(tanpa caption)";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function buildPlatformSummary(platformLabel, status) {
  if (!status) return `${platformLabel}: Data tidak tersedia.`;
  if (status.error) {
    return `${platformLabel}: Gagal mengambil data (${status.error}).`;
  }
  if (!status.found) {
    return `${platformLabel}: Username belum tercatat di database.`;
  }
  const metrics = [];
  if (status.posts !== null) metrics.push(`Postingan ${formatNumber(status.posts)}`);
  if (status.followers !== null) metrics.push(`Followers ${formatNumber(status.followers)}`);
  if (status.following !== null) metrics.push(`Following ${formatNumber(status.following)}`);
  if (status.likes !== null) metrics.push(`Likes ${formatNumber(status.likes)}`);
  const detail = metrics.length ? metrics.join(" | ") : "Belum ada statistik terbaru";
  return `${platformLabel}: ${status.state || "Aktif"}${detail ? ` – ${detail}` : ""}`;
}

async function buildAccountStatus(user) {
  const result = {
    adminMessage: "",
    instagram: {
      username: "",
      found: false,
      posts: null,
      followers: null,
      following: null,
      state: "",
      error: "",
      summaryForSolution: "",
      reviewNote: "",
    },
    tiktok: {
      username: "",
      found: false,
      posts: null,
      followers: null,
      following: null,
      likes: null,
      state: "",
      error: "",
      summaryForSolution: "",
      reviewNote: "",
    },
  };

  const lines = ["📱 *Status Akun Sosial Media*"];

  const instaUsernameRaw =
    typeof user?.insta === "string" ? user.insta.trim() : user?.insta || "";
  const instaHandle = ensureHandle(instaUsernameRaw);
  result.instagram.username = instaHandle;
  if (!instaHandle) {
    lines.push("", "📸 Instagram: Belum diisi di profil Cicero.");
    result.instagram.summaryForSolution =
      "Instagram: Username belum tercatat, mohon perbarui melalui tautan data personel.";
  } else {
    try {
      const profile = await fetchInstagramInfo(instaHandle.replace(/^@/, ""));
      const data = profile || {};
      const followerCount =
        data.followers_count ?? data.follower_count ?? data.edge_followed_by?.count ?? null;
      const followingCount =
        data.following_count ?? data.following ?? data.edge_follow?.count ?? null;
      const mediaCount =
        data.media_count ?? data.posts_count ?? data.edge_owner_to_timeline_media?.count ?? null;
      const state = data.is_private === true ? "Aktif (Privat)" : "Aktif";

      Object.assign(result.instagram, {
        found: true,
        posts: mediaCount,
        followers: followerCount,
        following: followingCount,
        state,
        summaryForSolution: buildPlatformSummary(
          `Instagram (${instaHandle})`,
          {
            found: true,
            posts: mediaCount,
            followers: followerCount,
            following: followingCount,
            state,
          }
        ),
      });

      lines.push(
        "",
        `📸 Instagram *${instaHandle}*`,
        `Status: ${state}`,
        `Postingan: ${formatNumber(mediaCount)}`,
        `Followers: ${formatNumber(followerCount)}`,
        `Following: ${formatNumber(followingCount)}`
      );

      if (
        isZeroMetric(mediaCount) &&
        isZeroMetric(followerCount) &&
        isZeroMetric(followingCount)
      ) {
        const note = buildSuspiciousAccountNote("instagram", instaHandle);
        result.instagram.reviewNote = note;
        result.instagram.summaryForSolution = result.instagram.summaryForSolution
          ? `${result.instagram.summaryForSolution}\n\n${note}`
          : note;
        lines.push("", note);
      }
    } catch (err) {
      const errorMsg = err?.message || "tidak diketahui";
      result.instagram.error = errorMsg;
      result.instagram.summaryForSolution = buildPlatformSummary("Instagram", {
        error: errorMsg,
      });
      lines.push(
        "",
        `📸 Instagram *${instaHandle}*`,
        `Status: Gagal mengambil data (${errorMsg}).`
      );
    }
  }

  const tiktokUsernameRaw =
    typeof user?.tiktok === "string" ? user.tiktok.trim() : user?.tiktok || "";
  const tiktokHandle = ensureHandle(tiktokUsernameRaw);
  result.tiktok.username = tiktokHandle;
  if (!tiktokHandle) {
    lines.push("", "🎵 TikTok: Belum diisi di profil Cicero.");
    result.tiktok.summaryForSolution =
      "TikTok: Username belum tercatat, mohon perbarui melalui tautan data personel.";
  } else {
    try {
      const profile = await fetchTiktokProfile(tiktokHandle.replace(/^@/, ""));
      const data = profile || {};
      const followerCount = data.follower_count ?? data.stats?.followerCount ?? null;
      const followingCount = data.following_count ?? data.stats?.followingCount ?? null;
      const likeCount = data.like_count ?? data.stats?.heart ?? null;
      const videoCount = data.video_count ?? data.stats?.videoCount ?? null;
      const state = data.username || data.nickname ? "Aktif" : "";

      Object.assign(result.tiktok, {
        found: Boolean(data.username || data.nickname || data.stats),
        posts: videoCount,
        followers: followerCount,
        following: followingCount,
        likes: likeCount,
        state: state || "Aktif",
        summaryForSolution: buildPlatformSummary(
          `TikTok (${tiktokHandle})`,
          {
            found: Boolean(data.username || data.nickname || data.stats),
            posts: videoCount,
            followers: followerCount,
            following: followingCount,
            likes: likeCount,
            state: state || "Aktif",
          }
        ),
      });

      lines.push(
        "",
        `🎵 TikTok *${tiktokHandle}*`,
        `Status: ${state || "Aktif"}`,
        `Video: ${formatNumber(videoCount)}`,
        `Followers: ${formatNumber(followerCount)}`,
        `Following: ${formatNumber(followingCount)}`,
        `Likes: ${formatNumber(likeCount)}`
      );

      const likesUnavailable = likeCount === null || likeCount === undefined;
      if (
        isZeroMetric(videoCount) &&
        isZeroMetric(followerCount) &&
        isZeroMetric(followingCount) &&
        (likesUnavailable || isZeroMetric(likeCount))
      ) {
        const note = buildSuspiciousAccountNote("tiktok", tiktokHandle);
        result.tiktok.reviewNote = note;
        result.tiktok.summaryForSolution = result.tiktok.summaryForSolution
          ? `${result.tiktok.summaryForSolution}\n\n${note}`
          : note;
        lines.push("", note);
      }
    } catch (err) {
      const errorMsg = err?.message || "tidak diketahui";
      result.tiktok.error = errorMsg;
      result.tiktok.summaryForSolution = buildPlatformSummary("TikTok", {
        error: errorMsg,
      });
      lines.push(
        "",
        `🎵 TikTok *${tiktokHandle}*`,
        `Status: Gagal mengambil data (${errorMsg}).`
      );
    }
  }

  result.adminMessage = lines.join("\n").trim();
  return result;
}

async function fetchPendingTasksForToday(user) {
  if (!user?.user_id || !user?.client_id) {
    return { posts: [], pending: [], error: null };
  }

  try {
    const clientRes = await query(
      "SELECT LOWER(client_type) AS client_type FROM clients WHERE LOWER(client_id) = LOWER($1)",
      [user.client_id]
    );
    const clientType = clientRes.rows[0]?.client_type;
    const params = [];
    let joinClause = "";
    const conditions = [
      "(p.created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date",
    ];

    if (clientType === "direktorat") {
      const roleName = pickPrimaryRole(user) || user.client_id;
      if (!roleName) {
        return { posts: [], pending: [], error: null };
      }
      joinClause =
        "JOIN insta_post_roles pr ON pr.shortcode = p.shortcode JOIN roles r ON pr.role_id = r.role_id";
      params.push(roleName);
      conditions.unshift("LOWER(r.role_name) = LOWER($1)");
    } else {
      params.push(user.client_id);
      conditions.unshift("LOWER(p.client_id) = LOWER($1)");
    }

    const postsRes = await query(
      `SELECT p.shortcode, COALESCE(p.caption, '') AS caption
       FROM insta_post p
       ${joinClause}
       WHERE ${conditions.join(" AND ")}
       ORDER BY p.created_at ASC`,
      params
    );
    const posts = postsRes.rows || [];

    if (!posts.length) {
      return { posts: [], pending: [], error: null };
    }

    const reportRes = await query(
      `SELECT shortcode,
              instagram_link,
              facebook_link,
              twitter_link,
              tiktok_link,
              youtube_link
         FROM link_report
        WHERE user_id = $1
          AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date`,
      [user.user_id]
    );

    const completed = new Set(
      reportRes.rows
        .filter((row) =>
          [
            row.instagram_link,
            row.facebook_link,
            row.twitter_link,
            row.tiktok_link,
            row.youtube_link,
          ].some((value) => typeof value === "string" && value.trim() !== "")
        )
        .map((row) => row.shortcode)
    );

    const pending = posts.filter((post) => !completed.has(post.shortcode));

    return { posts, pending, error: null };
  } catch (err) {
    return { posts: [], pending: [], error: err };
  }
}

function detectKnownIssueKey(issueText) {
  if (!issueText) return null;
  const normalized = issueText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const hasInstagram = /instagram|ig/.test(normalized);
  const hasTiktok = /tiktok|tt/.test(normalized);
  const mentionsExecuted = /sudah\s+melaksanakan/.test(normalized);
  const mentionsNotRecorded = /(belum|blm|tidak)\s+terdata/.test(normalized);
  const mentionsLessAttendance = /terabsen\s+kurang|absen\s+kurang/.test(normalized);

  if (mentionsExecuted && hasInstagram && mentionsNotRecorded) {
    return "instagram_not_recorded";
  }
  if (mentionsExecuted && hasTiktok && mentionsNotRecorded) {
    return "tiktok_not_recorded";
  }
  if (mentionsExecuted && mentionsLessAttendance) {
    return "attendance_less";
  }
  return null;
}

function buildUpdateDataInstructions(platformLabel) {
  const steps = [
    `1. Buka tautan berikut: ${UPDATE_DATA_LINK}`,
    "2. Login menggunakan NRP/NIP dan kata sandi aplikasi Cicero.",
    `3. Pilih menu *Update Data Personil* kemudian perbarui username ${platformLabel}.`,
    "4. Pastikan username sesuai dengan akun aktif yang dipakai saat tugas, lalu simpan perubahan.",
    "5. Konfirmasi kepada admin setelah data diperbarui agar dapat sinkron otomatis.",
  ];
  return steps.join("\n");
}

function normalizeComplaintHandle(value) {
  return normalizeHandleValue(value);
}

function parseComplaintMessage(message) {
  const lines = String(message || "")
    .split(/\r?\n/)
    .map((line) => line.trim());
  const data = {
    raw: String(message || ""),
    nrp: "",
    name: "",
    polres: "",
    instagram: "",
    tiktok: "",
    issues: [],
  };

  const extractField = (line) => {
    const [, ...rest] = line.split(/[:：]/);
    return rest.join(":").trim();
  };

  let inIssues = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const normalized = line.toLowerCase();
    if (/^pesan\s+komplain/.test(normalized)) {
      continue;
    }
    if (/^kendala\b/.test(normalized.replace(/[:：]/g, ""))) {
      inIssues = true;
      continue;
    }

    if (inIssues) {
      const issueContent = line.replace(/^[-•●]+\s*/, "").trim();
      if (issueContent) {
        data.issues.push(issueContent);
      }
      continue;
    }

    if (normalized.startsWith("nrp")) {
      data.nrp = extractField(line);
      continue;
    }
    if (normalized.startsWith("nama")) {
      data.name = extractField(line);
      continue;
    }
    if (normalized.startsWith("polres")) {
      data.polres = extractField(line);
      continue;
    }
    if (normalized.startsWith("username ig") || normalized.startsWith("username instagram")) {
      data.instagram = normalizeComplaintHandle(extractField(line));
      continue;
    }
    if (normalized.startsWith("username tiktok")) {
      data.tiktok = normalizeComplaintHandle(extractField(line));
      continue;
    }
  }

  return data;
}

function handlesEqual(a, b) {
  if (!a || !b) return false;
  return a.replace(/^@/, "").toLowerCase() === b.replace(/^@/, "").toLowerCase();
}

async function verifyInstagramHandle(handle) {
  const normalized = normalizeComplaintHandle(handle);
  if (!normalized) {
    return { summary: "", error: null, status: null };
  }
  try {
    const profile = await fetchInstagramInfo(normalized.replace(/^@/, ""));
    const data = profile || {};
    const followerCount =
      data.followers_count ??
      data.follower_count ??
      data.edge_followed_by?.count ??
      null;
    const followingCount =
      data.following_count ?? data.following ?? data.edge_follow?.count ?? null;
    const mediaCount =
      data.media_count ?? data.posts_count ?? data.edge_owner_to_timeline_media?.count ?? null;
    const state = data.is_private === true ? "Aktif (Privat)" : "Aktif";

    const status = {
      found: Boolean(data),
      posts: mediaCount,
      followers: followerCount,
      following: followingCount,
      state,
    };

    return {
      summary: buildPlatformSummary(`Instagram (${normalized})`, status),
      error: null,
      status,
    };
  } catch (err) {
    const message = err?.message || "tidak diketahui";
    const status = {
      found: false,
      posts: null,
      followers: null,
      following: null,
      state: "",
      error: message,
    };
    return {
      summary: buildPlatformSummary(`Instagram (${normalized})`, status),
      error: message,
      status,
    };
  }
}

async function verifyTiktokHandle(handle) {
  const normalized = normalizeComplaintHandle(handle);
  if (!normalized) {
    return { summary: "", error: null, status: null };
  }
  try {
    const profile = await fetchTiktokProfile(normalized.replace(/^@/, ""));
    const data = profile || {};
    const followerCount = data.follower_count ?? data.stats?.followerCount ?? null;
    const followingCount = data.following_count ?? data.stats?.followingCount ?? null;
    const likeCount = data.like_count ?? data.stats?.heart ?? null;
    const videoCount = data.video_count ?? data.stats?.videoCount ?? null;
    const state = data.username || data.nickname ? "Aktif" : "";

    const status = {
      found: Boolean(data.username || data.nickname || data.stats),
      posts: videoCount,
      followers: followerCount,
      following: followingCount,
      likes: likeCount,
      state: state || "Aktif",
    };

    return {
      summary: buildPlatformSummary(`TikTok (${normalized})`, status),
      error: null,
      status,
    };
  } catch (err) {
    const message = err?.message || "tidak diketahui";
    const status = {
      found: false,
      posts: null,
      followers: null,
      following: null,
      likes: null,
      state: "",
      error: message,
    };
    return {
      summary: buildPlatformSummary(`TikTok (${normalized})`, status),
      error: message,
      status,
    };
  }
}

async function buildInstagramIssueSolution(issueText, parsed, user, accountStatus) {
  const dbHandle = ensureHandle(user?.insta);
  const complaintHandle = normalizeComplaintHandle(parsed.instagram);
  const clientId = user?.client_id || user?.clientId || null;
  if (dbHandle) {
    const now = new Date();
    const likeCount = await hasUserLikedBetween(
      dbHandle,
      ACTIVITY_START_DATE,
      now,
      clientId
    );
    if (likeCount > 0) {
      return buildRecordedActivitySolution({
        issueText,
        platform: "Instagram",
        activityVerb: "memberikan like",
        handle: dbHandle,
        activityCount: likeCount,
        startDate: ACTIVITY_START_DATE,
        endDate: now,
      });
    }
  }

  const lines = [`• Kendala: ${issueText}`];
  const dbStatus = accountStatus?.instagram || {};
  const handlesMatch =
    complaintHandle && dbHandle ? handlesEqual(complaintHandle, dbHandle) : false;
  const treatAsSameHandle = handlesMatch || !complaintHandle;
  const complaintCheck = complaintHandle
    ? await verifyInstagramHandle(complaintHandle)
    : { summary: "", error: null, status: null };

  lines.push("", "Perbandingan data:");
  lines.push(`- Username pada database Cicero: ${dbHandle || "Belum tercatat."}`);
  lines.push(
    `- Username pada pesan komplain: ${complaintHandle || "Tidak dicantumkan."}`
  );

  const rapidLines = [];
  if (dbStatus.summaryForSolution) {
    if (treatAsSameHandle) {
      rapidLines.push(dbStatus.summaryForSolution);
    } else {
      rapidLines.push(`- Database: ${dbStatus.summaryForSolution}`);
    }
  } else if (dbHandle) {
    const fallbackStatus = dbStatus.error
      ? { error: dbStatus.error }
      : { found: false };
    const fallbackLabel = dbHandle ? `Instagram (${dbHandle})` : "Instagram";
    const fallbackSummary = buildPlatformSummary(
      fallbackLabel,
      fallbackStatus
    );
    if (treatAsSameHandle) rapidLines.push(fallbackSummary);
    else rapidLines.push(`- Database: ${fallbackSummary}`);
  }

  if (!treatAsSameHandle && complaintHandle) {
    if (complaintCheck.summary) {
      rapidLines.push(`- Komplain: ${complaintCheck.summary}`);
    } else if (complaintCheck.error) {
      rapidLines.push(`- Komplain: Gagal diperiksa (${complaintCheck.error}).`);
    } else {
      rapidLines.push(
        `- Komplain: Username ${complaintHandle} belum terbaca di RapidAPI.`
      );
    }
  }

  if (rapidLines.length) {
    lines.push("", "Hasil pengecekan RapidAPI:");
    lines.push(...rapidLines);
  }

  const dbFound = Boolean(dbStatus?.found);
  const dbActive = dbFound && hasFullMetrics(dbStatus);
  const complaintFound = Boolean(complaintCheck.status?.found);
  const complaintActive = complaintFound && hasFullMetrics(complaintCheck.status);
  const actions = [];

  if (treatAsSameHandle) {
    if (dbActive) {
      actions.push(
        "Akun Instagram pada database sudah aktif dan sesuai. Pandu personel membuka menu *Absensi Amplifikasi* di dashboard Cicero, pilih satker/periode yang relevan lalu tekan *Refresh* untuk memastikan catatan like muncul. Jika setelah refresh data belum ada, minta mereka mengirim bukti link tugas atau screenshot hasil refresh kepada admin. Bila bukti sudah dikirim namun data tetap tidak masuk, eskalasi ke operator piket untuk pemeriksaan lanjutan."
      );
    } else if (dbFound) {
      actions.push(
        "Akun Instagram terdeteksi namun metrik aktivitasnya masih kosong. Dampingi personel memeriksa menu *Absensi Amplifikasi* dengan memilih satker/periode yang benar dan menekan *Refresh* untuk melihat apakah data sudah terbaca."
      );
      actions.push(
        "Jika username yang digunakan berubah atau data belum sesuai, arahkan untuk memperbarui informasi akun melalui instruksi berikut."
      );
      appendUpdateInstructions(actions, "Instagram");
      actions.push(
        "Setelah pembaruan atau koreksi dilakukan, minta kirim screenshot hasil refresh sebagai bukti. Bila data tetap tidak masuk, eskalasi ke operator piket."
      );
    } else {
      actions.push(
        "Username Instagram belum tercatat atau tidak terbaca. Bimbing personel membuka menu *Absensi Amplifikasi* dan menekan *Refresh* setelah memilih satker/periode untuk memastikan tidak ada pencatatan atas nama lain."
      );
      actions.push(
        "Minta mereka menyesuaikan data akun melalui instruksi berikut sebelum melakukan pengecekan ulang."
      );
      appendUpdateInstructions(actions, "Instagram");
      actions.push(
        "Setelah memperbarui data, minta bukti screenshot hasil refresh atau link tugas yang sudah dijalankan. Jika data masih belum tercatat, eskalasi ke operator piket."
      );
    }
  } else if (dbActive && !complaintFound) {
    actions.push(
      "Akun Instagram yang tersimpan di database sudah benar dan aktif. Pandu personel memastikan pelaksanaan tugas menggunakan username tersebut lalu cek menu *Absensi Amplifikasi* dengan menekan *Refresh*. Jika data komplain memakai username lain, arahkan koreksi atau pembaruan sebelum melapor ulang. Mintakan juga screenshot hasil refresh; bila data tetap tidak masuk, eskalasi ke operator piket."
    );
  } else if (complaintActive && !dbFound) {
    actions.push(
      "Username Instagram pada pesan komplain terbaca aktif sementara database belum memuatnya. Bimbing personel membuka menu *Absensi Amplifikasi*, pilih satker/periode yang sesuai, lalu tekan *Refresh* untuk melihat apakah username baru sudah muncul."
    );
    actions.push(
      "Minta mereka segera memperbarui data Cicero menggunakan username tersebut melalui panduan berikut."
    );
    appendUpdateInstructions(actions, "Instagram");
    actions.push(
      "Setelah update, mintakan screenshot hasil refresh atau link tugas sebagai bukti. Jika tetap tidak masuk, eskalasi ke operator piket."
    );
  } else if (!dbActive && !complaintActive) {
    actions.push(
      "Kedua username belum terbaca aktif. Minta personel memastikan akun yang benar lalu cek menu *Absensi Amplifikasi* dengan menekan *Refresh* setelah memilih satker/periode."
    );
    actions.push(
      "Setelah konfirmasi akun yang valid, arahkan pembaruan data melalui panduan berikut sebelum melakukan pengecekan ulang."
    );
    appendUpdateInstructions(actions, "Instagram");
    actions.push(
      "Kumpulkan screenshot hasil refresh setelah pembaruan; apabila data masih tidak tercatat, eskalasi ke operator piket."
    );
  } else {
    actions.push(
      "Kedua username berbeda namun sama-sama terbaca. Pandu personel memverifikasi akun mana yang dipakai tugas melalui menu *Absensi Amplifikasi* dan tekan *Refresh* untuk melihat catatan yang tampil."
    );
    actions.push(
      "Setelah akun yang benar ditetapkan, minta pembaruan data agar konsisten menggunakan panduan berikut."
    );
    appendUpdateInstructions(actions, "Instagram");
    actions.push(
      "Minta bukti screenshot hasil refresh setelah penyesuaian; jika data tetap tidak masuk, eskalasi ke operator piket."
    );
  }

  if (actions.length) {
    lines.push("", "Langkah tindak lanjut:");
    lines.push(...actions);
  }

  return lines.join("\n").trim();
}

async function buildTiktokIssueSolution(issueText, parsed, user, accountStatus) {
  const dbHandle = ensureHandle(user?.tiktok);
  const complaintHandle = normalizeComplaintHandle(parsed.tiktok);
  const clientId = user?.client_id || user?.clientId || null;
  if (dbHandle) {
    const now = new Date();
    const commentCount = await hasUserCommentedBetween(
      dbHandle,
      ACTIVITY_START_DATE,
      now,
      clientId
    );
    if (commentCount > 0) {
      return buildRecordedActivitySolution({
        issueText,
        platform: "TikTok",
        activityVerb: "memberikan komentar",
        handle: dbHandle,
        activityCount: commentCount,
        startDate: ACTIVITY_START_DATE,
        endDate: now,
      });
    }
  }

  const lines = [`• Kendala: ${issueText}`];
  const dbStatus = accountStatus?.tiktok || {};
  const handlesMatch =
    complaintHandle && dbHandle ? handlesEqual(complaintHandle, dbHandle) : false;
  const treatAsSameHandle = handlesMatch || !complaintHandle;
  const complaintCheck = complaintHandle
    ? await verifyTiktokHandle(complaintHandle)
    : { summary: "", error: null, status: null };

  lines.push("", "Perbandingan data:");
  lines.push(`- Username pada database Cicero: ${dbHandle || "Belum tercatat."}`);
  lines.push(
    `- Username pada pesan komplain: ${complaintHandle || "Tidak dicantumkan."}`
  );

  const rapidLines = [];
  if (dbStatus.summaryForSolution) {
    if (treatAsSameHandle) {
      rapidLines.push(dbStatus.summaryForSolution);
    } else {
      rapidLines.push(`- Database: ${dbStatus.summaryForSolution}`);
    }
  } else if (dbHandle) {
    const fallbackStatus = dbStatus.error
      ? { error: dbStatus.error }
      : { found: false };
    const fallbackLabel = dbHandle ? `TikTok (${dbHandle})` : "TikTok";
    const fallbackSummary = buildPlatformSummary(
      fallbackLabel,
      fallbackStatus
    );
    if (treatAsSameHandle) rapidLines.push(fallbackSummary);
    else rapidLines.push(`- Database: ${fallbackSummary}`);
  }

  if (!treatAsSameHandle && complaintHandle) {
    if (complaintCheck.summary) {
      rapidLines.push(`- Komplain: ${complaintCheck.summary}`);
    } else if (complaintCheck.error) {
      rapidLines.push(`- Komplain: Gagal diperiksa (${complaintCheck.error}).`);
    } else {
      rapidLines.push(
        `- Komplain: Username ${complaintHandle} belum terbaca di RapidAPI.`
      );
    }
  }

  if (rapidLines.length) {
    lines.push("", "Hasil pengecekan RapidAPI:");
    lines.push(...rapidLines);
  }

  const dbFound = Boolean(dbStatus?.found);
  const dbActive = dbFound && hasFullMetrics(dbStatus);
  const complaintFound = Boolean(complaintCheck.status?.found);
  const complaintActive = complaintFound && hasFullMetrics(complaintCheck.status);
  const actions = [];

  if (treatAsSameHandle) {
    if (dbActive) {
      actions.push(
        "Akun TikTok pada database sudah aktif dan sesuai. Pandu personel membuka menu *Absensi Komentar* di dashboard Cicero, pilih satker/periode yang relevan lalu tekan *Refresh* untuk memastikan catatan komentar tampil. Jika masih kosong, minta mereka mengirim link video tugas atau screenshot hasil refresh kepada admin. Bila bukti sudah dikirim namun data belum masuk, eskalasi ke operator piket."
      );
    } else if (dbFound) {
      actions.push(
        "Akun TikTok terdeteksi namun metrik aktivitasnya masih kosong. Dampingi personel memeriksa menu *Absensi Komentar* dengan memilih satker/periode yang tepat dan menekan *Refresh* untuk melihat apakah ada pencatatan."
      );
      actions.push(
        "Jika username yang digunakan berubah atau data berbeda, arahkan pembaruan melalui panduan berikut."
      );
      appendUpdateInstructions(actions, "TikTok");
      actions.push(
        "Setelah koreksi, minta mereka mengirim screenshot hasil refresh atau link video komentar sebagai bukti. Jika tetap belum masuk, eskalasi ke operator piket."
      );
    } else {
      actions.push(
        "Username TikTok belum tercatat atau tidak terbaca. Bimbing personel membuka menu *Absensi Komentar* dan tekan *Refresh* setelah memilih satker/periode untuk memastikan tidak ada pencatatan dengan username lama."
      );
      actions.push(
        "Minta penyesuaian data akun melalui panduan berikut sebelum cek ulang."
      );
      appendUpdateInstructions(actions, "TikTok");
      actions.push(
        "Setelah perbarui, minta bukti screenshot hasil refresh atau link komentar; bila masih kosong, eskalasi ke operator piket."
      );
    }
  } else if (dbActive && !complaintFound) {
    actions.push(
      "Akun TikTok yang tersimpan di database sudah benar dan aktif. Pandu personel menggunakan username tersebut saat tugas lalu cek menu *Absensi Komentar* dengan menekan *Refresh*. Jika laporan memakai username lain, arahkan koreksi data sebelum melapor ulang. Mintakan juga link tugas atau screenshot hasil refresh; bila tetap tidak masuk, eskalasi ke operator piket."
    );
  } else if (complaintActive && !dbFound) {
    actions.push(
      "Username TikTok pada pesan komplain terbaca aktif sementara database belum memuatnya. Bimbing personel membuka menu *Absensi Komentar*, pilih satker/periode yang sesuai, lalu tekan *Refresh* untuk melihat apakah username baru sudah muncul."
    );
    actions.push(
      "Minta mereka segera memperbarui data Cicero menggunakan username tersebut melalui panduan berikut."
    );
    appendUpdateInstructions(actions, "TikTok");
    actions.push(
      "Setelah update, minta bukti link video atau screenshot hasil refresh sebagai bukti. Jika tetap tidak masuk, eskalasi ke operator piket."
    );
  } else if (!dbActive && !complaintActive) {
    actions.push(
      "Kedua username TikTok belum terbaca aktif. Minta personel memastikan akun yang benar lalu cek menu *Absensi Komentar* dengan menekan *Refresh* setelah memilih satker/periode."
    );
    actions.push(
      "Setelah memastikan akun valid, arahkan pembaruan data lewat panduan berikut sebelum melakukan pengecekan ulang."
    );
    appendUpdateInstructions(actions, "TikTok");
    actions.push(
      "Minta screenshot hasil refresh atau link video setelah pembaruan; jika tetap tidak ada, eskalasi ke operator piket."
    );
  } else {
    actions.push(
      "Kedua username TikTok berbeda namun sama-sama terbaca. Pandu personel memverifikasi akun mana yang dipakai tugas melalui menu *Absensi Komentar* dan tekan *Refresh* untuk melihat catatan yang tampil."
    );
    actions.push(
      "Tetapkan username yang benar lalu perbarui data melalui panduan berikut."
    );
    appendUpdateInstructions(actions, "TikTok");
    actions.push(
      "Minta bukti screenshot hasil refresh atau link komentar usai penyesuaian; jika data belum masuk, eskalasi ke operator piket."
    );
  }

  if (actions.length) {
    lines.push("", "Langkah tindak lanjut:");
    lines.push(...actions);
  }

  return lines.join("\n").trim();
}

async function buildAttendanceIssueSolution(issueText, user) {
  const lines = [`• Kendala: ${issueText}`];
  const { pending, error } = await fetchPendingTasksForToday(user);
  if (error) {
    lines.push(`Gagal mengambil data tugas: ${error.message}`);
  } else if (!pending.length) {
    lines.push(
      "Semua link tugas hari ini sudah tercatat di sistem. Jika masih terdapat perbedaan, mohon kirim bukti pengiriman link."
    );
  } else {
    lines.push("Berikut daftar link tugas yang belum tercatat pada sistem hari ini:");
    pending.forEach((post, idx) => {
      const link = `https://www.instagram.com/p/${post.shortcode}/`;
      lines.push(`${idx + 1}. ${shortenCaption(post.caption)}`);
      lines.push(`   ${link}`);
    });
  }
  lines.push("", "Silakan lakukan update link melalui menu *Update Tugas* pada aplikasi Cicero setelah melaksanakan tugas.");
  lines.push(
    "Jika seluruh tugas sudah dikerjakan, mohon kirimkan bukti screenshot update link kepada admin untuk verifikasi."
  );
  return lines.join("\n").trim();
}

async function buildComplaintSolutionsFromIssues(parsed, user, accountStatus) {
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.map((issue) => issue.trim()).filter(Boolean)
    : [];
  if (!issues.length) {
    return { solutionText: "", handledKeys: new Set() };
  }

  const handledKeys = new Set();
  const solutions = [];

  for (const issueText of issues) {
    const key = detectKnownIssueKey(issueText);
    if (!key || handledKeys.has(key)) {
      continue;
    }
    handledKeys.add(key);

    if (key === "instagram_not_recorded") {
      solutions.push(await buildInstagramIssueSolution(issueText, parsed, user, accountStatus));
      continue;
    }
    if (key === "tiktok_not_recorded") {
      solutions.push(await buildTiktokIssueSolution(issueText, parsed, user, accountStatus));
      continue;
    }
    if (key === "attendance_less") {
      solutions.push(await buildAttendanceIssueSolution(issueText, user));
    }
  }

  return { solutionText: solutions.join("\n\n"), handledKeys };
}

async function processComplaintResolution(session, chatId, waClient) {
  const data = session.respondComplaint || {};
  const { nrp, user, issue, solution } = data;
  if (!nrp || !user || !issue || !solution) {
    delete session.respondComplaint;
    session.step = "main";
    await waClient.sendMessage(
      chatId,
      "Data komplain tidak lengkap. Silakan mulai ulang proses respon komplain."
    );
    return false;
  }

  try {
    const { reporterName, nrp: reporterNrp } = await sendComplaintResponse(session, waClient);
    const adminSummary = [
      "📨 *Ringkasan Respon Komplain*",
      "Respon telah disampaikan kepada pelapor. Mohon catat tindak lanjut berikut sebagai arsip:",
      "",
      "👤 *Identitas Pelapor*",
      formatUserData(user),
      "",
      "🛑 *Kendala yang dicatat*",
      issue,
      "",
      "✅ *Solusi/Tindak Lanjut yang dikirim*",
      solution,
    ]
      .join("\n")
      .trim();

    await safeSendMessage(waClient, chatId, adminSummary);
    await waClient.sendMessage(
      chatId,
      `✅ Respon komplain telah dikirim ke ${reporterName} (${reporterNrp}).`
    );
    delete session.respondComplaint;
    session.step = "main";
    return true;
  } catch (err) {
    const reporterName = formatNama(user) || user.nama || nrp;
    await waClient.sendMessage(
      chatId,
      `❌ Gagal mengirim respon ke ${reporterName}: ${err.message}`
    );
    delete session.respondComplaint;
    session.step = "main";
    return false;
  }
}

async function maybeHandleAutoSolution(session, chatId, waClient) {
  const data = session.respondComplaint || {};
  const issueKey = detectKnownIssueKey(data.issue);
  if (!issueKey) return false;

  try {
    if (issueKey === "instagram_not_recorded") {
      const summary =
        data.accountStatus?.instagram?.summaryForSolution ||
        "Data Instagram belum tersedia.";
      const solution = [
        summary,
        "",
        "Langkah tindak lanjut:",
        buildUpdateDataInstructions("Instagram"),
        "",
        `Tautan update data personel: ${UPDATE_DATA_LINK}`,
      ].join("\n");
      session.respondComplaint.solution = solution;
      return await processComplaintResolution(session, chatId, waClient);
    }

    if (issueKey === "tiktok_not_recorded") {
      const summary =
        data.accountStatus?.tiktok?.summaryForSolution ||
        "Data TikTok belum tersedia.";
      const solution = [
        summary,
        "",
        "Langkah tindak lanjut:",
        buildUpdateDataInstructions("TikTok"),
        "",
        `Tautan update data personel: ${UPDATE_DATA_LINK}`,
      ].join("\n");
      session.respondComplaint.solution = solution;
      return await processComplaintResolution(session, chatId, waClient);
    }

    if (issueKey === "attendance_less") {
      const { pending, error } = await fetchPendingTasksForToday(data.user);
      let summary;
      if (error) {
        summary = `Gagal mengambil data tugas: ${error.message}`;
      } else if (!pending.length) {
        summary =
          "Semua link tugas hari ini sudah tercatat di sistem. Jika masih terdapat perbedaan, mohon kirim bukti pengiriman link.";
      } else {
        const taskLines = pending.map((post, idx) => {
          const link = `https://www.instagram.com/p/${post.shortcode}/`;
          return `${idx + 1}. ${shortenCaption(post.caption)}\n   ${link}`;
        });
        summary = [
          "Berikut daftar link tugas yang belum tercatat pada sistem hari ini:",
          ...taskLines,
        ].join("\n");
      }

      const solution = [
        summary,
        "",
        "Silakan lakukan update link melalui menu *Update Tugas* pada aplikasi Cicero setelah melaksanakan tugas.",
        "Jika seluruh tugas sudah dikerjakan, mohon kirimkan bukti screenshot update link kepada admin untuk verifikasi.",
      ].join("\n");

      session.respondComplaint.solution = solution;
      return await processComplaintResolution(session, chatId, waClient);
    }
  } catch (err) {
    console.error(`[RESPOND COMPLAINT] Auto-solution error: ${err.message}`);
    await waClient.sendMessage(
      chatId,
      "⚠️ Gagal menyiapkan solusi otomatis. Silakan tuliskan solusi secara manual."
    );
    return false;
  }

  return false;
}

async function collectMarkdownFiles(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const res = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownFiles(res, files);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(res);
    }
  }
  return files;
}

async function buildDocsPdf(rootDir, filename) {
  const files = await collectMarkdownFiles(rootDir);
  if (!files.length) throw new Error("Tidak ada file Markdown ditemukan.");
  files.sort();
  const parts = [];
  for (const file of files) {
    const name = path.basename(file);
    const content = await fs.readFile(file, "utf8");
    if (parts.length)
      parts.push("\n<div style=\"page-break-before: always;\"></div>\n");
    parts.push(`# ${name}\n\n${content}\n`);
  }
  const mdContent = parts.join("\n");
  const pdf = await mdToPdf({ content: mdContent });
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "docs-"));
  const pdfPath = path.join(tmpDir, filename);
  await fs.writeFile(pdfPath, pdf.content);
  const buffer = await fs.readFile(pdfPath);
  try {
    await fs.unlink(pdfPath);
    await fs.rmdir(tmpDir);
  } catch (e) {
    ignore(e);
  }
  return buffer;
}

async function absensiUsernameInsta(client_id, userModel, mode = "all") {
  let sudah = [], belum = [];
  if (mode === "sudah") {
    sudah = await userModel.getInstaFilledUsersByClient(client_id);
  } else if (mode === "belum") {
    belum = await userModel.getInstaEmptyUsersByClient(client_id);
  } else {
    sudah = await userModel.getInstaFilledUsersByClient(client_id);
    belum = await userModel.getInstaEmptyUsersByClient(client_id);
  }

  let msg = `*Absensi Username Instagram*\nClient: *${client_id}*`;

  // Sudah mengisi IG
  if (mode === "all" || mode === "sudah") {
    msg += `\n\n*Sudah mengisi IG* (${sudah.length}):`;
    if (sudah.length) {
      const byDiv = groupByDivision(sudah);
      const keys = sortDivisionKeys(Object.keys(byDiv));
      keys.forEach((div, idx) => {
        if (idx > 0) msg += `\n─────`; // pisahkan antar satfung
        msg += `\n• *${div}* (${byDiv[div].length})\n`;
        msg += byDiv[div]
          .map((u, i) => `  ${i + 1}. ${u.nama} (${u.user_id}) @${u.insta}`)
          .join("\n");
      });
    } else {
      msg += `\n-`;
    }
  }

  if (mode === "all") msg += "\n";

  // Belum mengisi IG
  if (mode === "all" || mode === "belum") {
    msg += `\n*Belum mengisi IG* (${belum.length}):`;
    if (belum.length) {
      const byDiv = groupByDivision(belum);
      const keys = sortDivisionKeys(Object.keys(byDiv));
      keys.forEach((div, idx) => {
        if (idx > 0) msg += `\n─────`; // pisahkan antar satfung
        msg += `\n• *${div}* (${byDiv[div].length})\n`;
        msg += byDiv[div]
          .map((u, i) => `  ${i + 1}. ${u.nama} (${u.user_id})`)
          .join("\n");
      });
    } else {
      msg += `\n-`;
    }
  }
  return msg;
}

async function absensiUsernameTiktok(client_id, userModel, mode = "all") {
  let sudah = [], belum = [];
  if (mode === "sudah") {
    sudah = await userModel.getTiktokFilledUsersByClient(client_id);
  } else if (mode === "belum") {
    belum = await userModel.getTiktokEmptyUsersByClient(client_id);
  } else {
    sudah = await userModel.getTiktokFilledUsersByClient(client_id);
    belum = await userModel.getTiktokEmptyUsersByClient(client_id);
  }

  let msg = `*Absensi Username TikTok*\nClient: *${client_id}*`;

  if (mode === "all" || mode === "sudah") {
    msg += `\n\n*Sudah mengisi TikTok* (${sudah.length}):`;
    if (sudah.length) {
      const byDiv = groupByDivision(sudah);
      const keys = sortDivisionKeys(Object.keys(byDiv));
      keys.forEach((div, idx) => {
        if (idx > 0) msg += `\n─────`; // pisahkan antar satfung
        msg += `\n• *${div}* (${byDiv[div].length})\n`;
        msg += byDiv[div]
          .map((u, i) => `  ${i + 1}. ${u.nama} (${u.user_id}) @${u.tiktok}`)
          .join("\n");
      });
    } else {
      msg += `\n-`;
    }
  }

  if (mode === "all") msg += "\n";

  if (mode === "all" || mode === "belum") {
    msg += `\n*Belum mengisi TikTok* (${belum.length}):`;
    if (belum.length) {
      const byDiv = groupByDivision(belum);
      const keys = sortDivisionKeys(Object.keys(byDiv));
      keys.forEach((div, idx) => {
        if (idx > 0) msg += `\n─────`; // pisahkan antar satfung
        msg += `\n• *${div}* (${byDiv[div].length})\n`;
        msg += byDiv[div]
          .map((u, i) => `  ${i + 1}. ${u.nama} (${u.user_id})`)
          .join("\n");
      });
    } else {
      msg += `\n-`;
    }
  }
  return msg;
}

// ====================
// MAIN HANDLER OBJECT
// ====================
export const clientRequestHandlers = {
  main: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent,
    handleFetchKomentarTiktokBatch
  ) => {
    const msg = `
┏━━━ *MENU CLIENT CICERO* ━━━
1️⃣ Manajemen Client & User
2️⃣ Operasional Media Sosial
3️⃣ Transfer & Laporan
4️⃣ Administratif
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ketik *angka* menu, atau *batal* untuk keluar.
`.trim();

    if (!/^[1-4]$/.test(text.trim())) {
      session.step = "main";
      await waClient.sendMessage(chatId, msg);
      return;
    }
    const mapStep = {
      1: "clientMenu_management",
      2: "clientMenu_social",
      3: "clientMenu_transfer",
      4: "clientMenu_admin",
    };
    session.step = mapStep[text.trim()];
    await clientRequestHandlers[session.step](
      session,
      chatId,
      "",
      waClient,
      pool,
      userModel,
      clientService,
      migrateUsersFromFolder,
      checkGoogleSheetCsvStatus,
      importUsersFromGoogleSheet,
      fetchAndStoreInstaContent,
      fetchAndStoreTiktokContent,
      formatClientData,
      fetchAndStoreLikesInstaContent,
      handleFetchKomentarTiktokBatch
    );
  },

  clientMenu_management: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent,
    handleFetchKomentarTiktokBatch
  ) => {
    if (text.trim().toLowerCase() === "batal") {
      await clientRequestHandlers.main(
        session,
        chatId,
        "",
        waClient,
        pool,
        userModel,
        clientService,
        migrateUsersFromFolder,
        checkGoogleSheetCsvStatus,
        importUsersFromGoogleSheet,
        fetchAndStoreInstaContent,
        fetchAndStoreTiktokContent,
        formatClientData,
        fetchAndStoreLikesInstaContent,
        handleFetchKomentarTiktokBatch
      );
      return;
    }

    const msg = `
┏━━━ *Manajemen Client & User* ━━━
1️⃣ Tambah client baru
2️⃣ Kelola client (update/hapus/info)
3️⃣ Kelola user (update/exception/status)
4️⃣ Hapus WA User
5️⃣ Penghapusan Massal Status User
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ketik *angka* menu, atau *batal* untuk kembali.
`.trim();

    if (!/^[1-5]$/.test(text.trim())) {
      session.step = "clientMenu_management";
      await waClient.sendMessage(chatId, msg);
      return;
    }

    const mapStep = {
      1: "addClient_id",
      2: "kelolaClient_choose",
      3: "kelolaUser_choose",
      4: "hapusWAUser_start",
      5: "bulkStatus_prompt",
    };

    session.step = mapStep[text.trim()];
    await clientRequestHandlers[session.step](
      session,
      chatId,
      "",
      waClient,
      pool,
      userModel,
      clientService,
      migrateUsersFromFolder,
      checkGoogleSheetCsvStatus,
      importUsersFromGoogleSheet,
      fetchAndStoreInstaContent,
      fetchAndStoreTiktokContent,
      formatClientData,
      fetchAndStoreLikesInstaContent,
      handleFetchKomentarTiktokBatch
    );
  },

  clientMenu_social: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent,
    handleFetchKomentarTiktokBatch
  ) => {
    if (text.trim().toLowerCase() === "batal") {
      await clientRequestHandlers.main(
        session,
        chatId,
        "",
        waClient,
        pool,
        userModel,
        clientService,
        migrateUsersFromFolder,
        checkGoogleSheetCsvStatus,
        importUsersFromGoogleSheet,
        fetchAndStoreInstaContent,
        fetchAndStoreTiktokContent,
        formatClientData,
        fetchAndStoreLikesInstaContent,
        handleFetchKomentarTiktokBatch
      );
      return;
    }

    const msg = `
┏━━━ *Operasional Media Sosial* ━━━
1️⃣ Proses Instagram
2️⃣ Proses TikTok
3️⃣ Absensi Username Instagram
4️⃣ Absensi Username TikTok
5️⃣ Download Sheet Amplifikasi
6️⃣ Download Sheet Amplifikasi Bulan sebelumnya
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ketik *angka* menu, atau *batal* untuk kembali.
`.trim();

    if (!/^[1-6]$/.test(text.trim())) {
      session.step = "clientMenu_social";
      await waClient.sendMessage(chatId, msg);
      return;
    }

    const mapStep = {
      1: "prosesInstagram_choose",
      2: "prosesTiktok_choose",
      3: "absensiUsernameInsta_choose",
      4: "absensiUsernameTiktok_choose",
      5: "downloadSheet_choose",
      6: "downloadSheetPrev_choose",
    };

    session.step = mapStep[text.trim()];
    await clientRequestHandlers[session.step](
      session,
      chatId,
      "",
      waClient,
      pool,
      userModel,
      clientService,
      migrateUsersFromFolder,
      checkGoogleSheetCsvStatus,
      importUsersFromGoogleSheet,
      fetchAndStoreInstaContent,
      fetchAndStoreTiktokContent,
      formatClientData,
      fetchAndStoreLikesInstaContent,
      handleFetchKomentarTiktokBatch
    );
  },

  clientMenu_transfer: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent,
    handleFetchKomentarTiktokBatch
  ) => {
    if (text.trim().toLowerCase() === "batal") {
      await clientRequestHandlers.main(
        session,
        chatId,
        "",
        waClient,
        pool,
        userModel,
        clientService,
        migrateUsersFromFolder,
        checkGoogleSheetCsvStatus,
        importUsersFromGoogleSheet,
        fetchAndStoreInstaContent,
        fetchAndStoreTiktokContent,
        formatClientData,
        fetchAndStoreLikesInstaContent,
        handleFetchKomentarTiktokBatch
      );
      return;
    }

    const msg = `
┏━━━ *Transfer & Laporan* ━━━
1️⃣ Transfer User
2️⃣ Absensi Operator Ditbinmas
3️⃣ Response Komplain
┗━━━━━━━━━━━━━━━━━━━━━━━━━━
Ketik *angka* menu, atau *batal* untuk kembali.
`.trim();

    if (!/^[1-3]$/.test(text.trim())) {
      session.step = "clientMenu_transfer";
      await waClient.sendMessage(chatId, msg);
      return;
    }

    const mapStep = {
      1: "transferUser_menu",
      2: "absensiOprDitbinmas",
      3: "respondComplaint_start",
    };

    session.step = mapStep[text.trim()];
    await clientRequestHandlers[session.step](
      session,
      chatId,
      "",
      waClient,
      pool,
      userModel,
      clientService,
      migrateUsersFromFolder,
      checkGoogleSheetCsvStatus,
      importUsersFromGoogleSheet,
      fetchAndStoreInstaContent,
      fetchAndStoreTiktokContent,
      formatClientData,
      fetchAndStoreLikesInstaContent,
      handleFetchKomentarTiktokBatch
    );
  },

  transferUser_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent,
    handleFetchKomentarTiktokBatch
  ) => {
    if (text.trim().toLowerCase() === "batal") {
      await clientRequestHandlers.clientMenu_transfer(
        session,
        chatId,
        "",
        waClient,
        pool,
        userModel,
        clientService,
        migrateUsersFromFolder,
        checkGoogleSheetCsvStatus,
        importUsersFromGoogleSheet,
        fetchAndStoreInstaContent,
        fetchAndStoreTiktokContent,
        formatClientData,
        fetchAndStoreLikesInstaContent,
        handleFetchKomentarTiktokBatch
      );
      return;
    }

    const msg = `
┏━━━ *Transfer User* ━━━
1️⃣ Dari Folder user_data
2️⃣ Dari Google Sheet
┗━━━━━━━━━━━━━━━━━━━━━━
Ketik *angka* sumber data, atau *batal* untuk kembali.
`.trim();

    if (!/^[1-2]$/.test(text.trim())) {
      session.step = "transferUser_menu";
      await waClient.sendMessage(chatId, msg);
      return;
    }

    const mapStep = {
      1: "transferUser_choose",
      2: "transferUserSheet_choose",
    };

    session.step = mapStep[text.trim()];
    await clientRequestHandlers[session.step](
      session,
      chatId,
      "",
      waClient,
      pool,
      userModel,
      clientService,
      migrateUsersFromFolder,
      checkGoogleSheetCsvStatus,
      importUsersFromGoogleSheet,
      fetchAndStoreInstaContent,
      fetchAndStoreTiktokContent,
      formatClientData,
      fetchAndStoreLikesInstaContent,
      handleFetchKomentarTiktokBatch
    );
  },

  clientMenu_admin: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent,
    handleFetchKomentarTiktokBatch
  ) => {
    if (text.trim().toLowerCase() === "batal") {
      await clientRequestHandlers.main(
        session,
        chatId,
        "",
        waClient,
        pool,
        userModel,
        clientService,
        migrateUsersFromFolder,
        checkGoogleSheetCsvStatus,
        importUsersFromGoogleSheet,
        fetchAndStoreInstaContent,
        fetchAndStoreTiktokContent,
        formatClientData,
        fetchAndStoreLikesInstaContent,
        handleFetchKomentarTiktokBatch
      );
      return;
    }

    const msg = `
┏━━━ *Administratif* ━━━
1️⃣ Exception Info
2️⃣ Hapus WA Admin
3️⃣ Download Docs
┗━━━━━━━━━━━━━━━━━━━━━━
Ketik *angka* menu, atau *batal* untuk kembali.
`.trim();

    if (!/^[1-3]$/.test(text.trim())) {
      session.step = "clientMenu_admin";
      await waClient.sendMessage(chatId, msg);
      return;
    }

    const mapStep = {
      1: "exceptionInfo_chooseClient",
      2: "hapusWAAdmin_confirm",
      3: "downloadDocs_choose",
    };

    session.step = mapStep[text.trim()];
    await clientRequestHandlers[session.step](
      session,
      chatId,
      "",
      waClient,
      pool,
      userModel,
      clientService,
      migrateUsersFromFolder,
      checkGoogleSheetCsvStatus,
      importUsersFromGoogleSheet,
      fetchAndStoreInstaContent,
      fetchAndStoreTiktokContent,
      formatClientData,
      fetchAndStoreLikesInstaContent,
      handleFetchKomentarTiktokBatch
    );
  },

  // ================== TAMBAH CLIENT ==================
  addClient_id: async (session, chatId, text, waClient) => {
    if (!text.trim()) {
      session.step = "addClient_id";
      await waClient.sendMessage(chatId, "Masukkan *ID* client:");
      return;
    }
    session.addClient_id = text.trim().toUpperCase();
    session.step = "addClient_nama";
    await waClient.sendMessage(chatId, "Masukkan *nama* client:");
  },
  addClient_nama: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService
  ) => {
    session.addClient_nama = text.trim();
    session.step = "addClient_confirm";
    await waClient.sendMessage(
      chatId,
      `Konfirmasi penambahan client:\n*ID*: ${session.addClient_id}\n*Nama*: ${session.addClient_nama}\n\nBalas *ya* untuk simpan atau *batal* untuk batalkan.`
    );
  },
  addClient_confirm: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService
  ) => {
    if (text.trim().toLowerCase() === "ya") {
      try {
        const data = {
          client_id: session.addClient_id,
          nama: session.addClient_nama,
        };
        const newClient = await clientService.createClient(data);
        await waClient.sendMessage(
          chatId,
          `✅ Client baru berhasil dibuat:\n${JSON.stringify(
            newClient,
            null,
            2
          )}`
        );
      } catch (e) {
        await waClient.sendMessage(
          chatId,
          "Gagal menambah client: " + e.message
        );
      }
    } else {
      await waClient.sendMessage(chatId, "Penambahan client dibatalkan.");
    }
    session.step = "main";
  },

  // ================== KELENGKAPAN CLIENT ==================
  kelolaClient_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService
  ) => {
    const rows = await query(
      "SELECT client_id, nama, client_status FROM clients ORDER BY client_status DESC, client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client (Semua Status)*\nBalas angka untuk memilih client:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama} ${
        c.client_status ? "🟢 Aktif" : "🔴 Tidak Aktif"
      }\n`;
    });
    session.step = "kelolaClient_action";
    await waClient.sendMessage(chatId, msg.trim());
  },
  kelolaClient_action: async (session, chatId, text, waClient) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai list."
      );
      return;
    }
    session.selected_client_id = clients[idx].client_id;
    session.step = "kelolaClient_menu";
    await waClient.sendMessage(
      chatId,
      `Kelola Client: *${clients[idx].nama}* (${clients[idx].client_id})\n` +
        `1️⃣ Update Data Client\n` +
        `2️⃣ Hapus Client\n` +
        `3️⃣ Info Client\n` +
        `4️⃣ Ubah Status Massal\nKetik angka menu di atas atau *batal* untuk keluar.`
    );
  },
  kelolaClient_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService
  ) => {
    if (text.trim() === "1") {
      session.step = "kelolaClient_updatefield";
      const fields = [
        { key: "client_insta", label: "Username Instagram" },
        { key: "client_operator", label: "Operator Client" },
        { key: "client_super", label: "Super Admin Client" },
        { key: "client_group", label: "Group Client" },
        { key: "tiktok_secuid", label: "TikTok SecUID" },
        { key: "client_tiktok", label: "Username TikTok" },
        { key: "client_status", label: "Status Aktif (true/false)" },
        { key: "client_insta_status", label: "Status IG Aktif (true/false)" },
        {
          key: "client_tiktok_status",
          label: "Status TikTok Aktif (true/false)",
        },
        {
          key: "client_amplify_status",
          label: "Status Amplifikasi (true/false)",
        },
        { key: "client_type", label: "Tipe Client" },
      ];
      session.updateFieldList = fields;
      let msg = `Pilih field yang ingin diupdate:\n`;
      fields.forEach((f, i) => {
        msg += `${i + 1}. ${f.label} [${f.key}]\n`;
      });
      msg += `\nBalas dengan angka sesuai daftar di atas.`;
      await waClient.sendMessage(chatId, msg);
    } else if (text.trim() === "2") {
      try {
        const removed = await clientService.deleteClient(
          session.selected_client_id
        );
        await waClient.sendMessage(
          chatId,
          removed ? `🗑️ Client berhasil dihapus.` : "❌ Client tidak ditemukan."
        );
      } catch (e) {
        await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
      session.step = "main";
    } else if (text.trim() === "3") {
      // Info client, tampilkan status Aktif/Nonaktif
      const client = await clientService.findClientById(
        session.selected_client_id
      );
      if (client) {
        let statusLine = client.client_status ? "🟢 Aktif" : "🔴 Tidak Aktif";
        let infoMsg =
          `*${client.client_id}*\n` +
          `_${client.nama}_\n` +
          `${statusLine}\n\n` +
          formatClientInfo(client);
        await waClient.sendMessage(chatId, infoMsg.trim());
      } else {
        await waClient.sendMessage(chatId, "❌ Client tidak ditemukan.");
      }
      session.step = "main";
    } else if (text.trim() === "4") {
      await clientRequestHandlers.bulkStatus_prompt(
        session,
        chatId,
        "",
        waClient,
        pool,
        userModel,
        clientService
      );
    } else {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai menu."
      );
    }
  },

  kelolaClient_updatefield: async (session, chatId, text, waClient) => {
    const idx = parseInt(text.trim()) - 1;
    const fields = session.updateFieldList || [];
    if (isNaN(idx) || !fields[idx]) {
      let msg = `Pilihan tidak valid. Balas angka sesuai daftar di atas.\n`;
      fields.forEach((f, i) => {
        msg += `${i + 1}. ${f.label} [${f.key}]\n`;
      });
      await waClient.sendMessage(chatId, msg.trim());
      return;
    }
    session.updateField = fields[idx].key;
    session.step = "kelolaClient_updatevalue";
    await waClient.sendMessage(
      chatId,
      `Masukkan value baru untuk *${fields[idx].label}* (key: ${fields[idx].key})\nUntuk boolean, isi dengan true/false:`
    );
  },
  kelolaClient_updatevalue: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService
  ) => {
    try {
      const updated = await clientService.updateClient(
        session.selected_client_id,
        { [session.updateField]: text.trim() }
      );
      await waClient.sendMessage(
        chatId,
        updated
          ? `✅ Update berhasil.\n${formatClientInfo(updated)}`
          : "❌ Client tidak ditemukan atau update gagal."
      );
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
  },

  // ================== KELENGKAPAN USER (ALL) ==================
  kelolaUser_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    await waClient.sendMessage(
      chatId,
      `Kelola User:\n1️⃣ Update Data User\n2️⃣ Update Exception\n3️⃣ Update Status\n4️⃣ Ubah Status Massal\nKetik angka menu atau *batal* untuk keluar.`
    );
    session.step = "kelolaUser_menu";
  },
  kelolaUser_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    if (!/^[1-4]$/.test(text.trim())) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka menu."
      );
      return;
    }
    if (text.trim() === "4") {
      delete session.kelolaUser_mode;
      await clientRequestHandlers.bulkStatus_prompt(
        session,
        chatId,
        "",
        waClient,
        pool,
        userModel
      );
      return;
    }
    session.kelolaUser_mode = text.trim();
    session.step = "kelolaUser_nrp";
    await waClient.sendMessage(chatId, "Masukkan *user_id* / NRP/NIP user:");
  },
  kelolaUser_nrp: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    session.target_user_id = text.trim();
    if (session.kelolaUser_mode === "1") {
      session.step = "kelolaUser_updatefield";
      let msg = `Pilih field user yang ingin diupdate:\n1. Nama\n2. Pangkat\n3. Satfung\n4. Jabatan\n5. Instagram\n6. TikTok\n7. WhatsApp\nBalas angka field.`;
      await waClient.sendMessage(chatId, msg);
    } else if (session.kelolaUser_mode === "2") {
      session.step = "kelolaUser_updateexception";
      await waClient.sendMessage(
        chatId,
        "Ketik *true* untuk exception, *false* untuk tidak exception:"
      );
    } else if (session.kelolaUser_mode === "3") {
      session.step = "kelolaUser_updatestatus";
      await waClient.sendMessage(
        chatId,
        "Ketik *true* untuk aktif, *false* untuk non-aktif:"
      );
    }
  },
  kelolaUser_updatefield: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    const fields = [
      "nama",
      "title",
      "divisi",
      "jabatan",
      "insta",
      "tiktok",
      "whatsapp",
    ];
    const idx = parseInt(text.trim()) - 1;
    if (isNaN(idx) || !fields[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai field."
      );
      return;
    }
    session.updateField = fields[idx];
    session.step = "kelolaUser_updatevalue";
    await waClient.sendMessage(
      chatId,
      `Ketik value baru untuk *${fields[idx]}* :`
    );
  },
  kelolaUser_updatevalue: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    try {
      const value = text.trim();
      await userModel.updateUserField(
        session.target_user_id,
        session.updateField,
        value
      );
      if (session.updateField === "whatsapp" && value) {
        await saveContactIfNew(formatToWhatsAppId(value));
      }
      await waClient.sendMessage(
        chatId,
        `✅ Data *${session.updateField}* untuk user *${session.target_user_id}* berhasil diupdate.`
      );
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error update: ${e.message}`);
    }
    session.step = "main";
  },
  kelolaUser_updateexception: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    try {
      const newException = text.trim().toLowerCase() === "true";
      await userModel.updateUserField(
        session.target_user_id,
        "exception",
        newException
      );
      await waClient.sendMessage(
        chatId,
        `✅ User ${session.target_user_id} diupdate exception=${newException}.`
      );
    } catch (e) {
      await waClient.sendMessage(
        chatId,
        `Gagal update exception: ${e.message}`
      );
    }
    session.step = "main";
  },
  kelolaUser_updatestatus: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    try {
      const newStatus = text.trim().toLowerCase() === "true";
      await userModel.updateUserField(
        session.target_user_id,
        "status",
        newStatus
      );
      await waClient.sendMessage(
        chatId,
        `✅ User ${session.target_user_id} diupdate status=${newStatus}.`
      );
    } catch (e) {
      await waClient.sendMessage(chatId, `Gagal update status: ${e.message}`);
    }
    session.step = "main";
  },

  // ================== PROSES INSTAGRAM (ALL) ==================
  prosesInstagram_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent
  ) => {
    // List client IG aktif, tapi tampilkan juga status
    const rows = await query(
      "SELECT client_id, nama, client_insta_status FROM clients ORDER BY client_id"
    );
    // Filter yang IG aktif
    const clients = rows.rows.filter((c) => c.client_insta_status);
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client IG aktif.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client IG Aktif*\nBalas angka untuk pilih client:\n\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n   ${
        c.client_insta_status ? "🟢 Aktif" : "🔴 Nonaktif"
      }\n\n`;
    });
    session.step = "prosesInstagram_action";
    await waClient.sendMessage(chatId, msg.trim());
  },

  prosesInstagram_action: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai list."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    session.selected_client_id = client_id;
    session.step = "prosesInstagram_menu";
    await waClient.sendMessage(
      chatId,
      `Proses Instagram untuk *${client_id}*:\n1️⃣ Fetch Konten IG\n2️⃣ Fetch Likes IG\n3️⃣ Absensi Likes IG\nBalas angka menu di atas atau *batal* untuk keluar.`
    );
  },
  prosesInstagram_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent
  ) => {
    const client_id = session.selected_client_id;
    if (text.trim() === "1") {
      try {
        await fetchAndStoreInstaContent(null, waClient, chatId, client_id);
        await waClient.sendMessage(
          chatId,
          `✅ Selesai fetch Instagram untuk ${client_id}.`
        );
      } catch (e) {
        await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
    } else if (text.trim() === "2") {
      try {
        await handleFetchLikesInstagram(waClient, chatId, client_id);
        await waClient.sendMessage(
          chatId,
          `✅ Selesai fetch likes IG untuk ${client_id}.`
        );
      } catch (e) {
        await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
    } else if (text.trim() === "3") {
      session.step = "absensiLikes_choose_submenu";
      session.absensi_client_id = client_id;
      let msg = `Pilih tipe rekap absensi likes IG:\n1. Akumulasi (Semua)\n2. Hanya Sudah\n3. Hanya Belum\n4. Per Konten (Semua)\n5. Per Konten Sudah\n6. Per Konten Belum\nBalas angka di atas.`;
      await waClient.sendMessage(chatId, msg);
      return;
    } else {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka menu."
      );
    }
    session.step = "main";
  },

  // ================== PROSES TIKTOK (ALL) ==================
  prosesTiktok_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent,
    handleFetchKomentarTiktokBatch
  ) => {
    // Ambil status juga untuk emoji
    const rows = await query(
      "SELECT client_id, nama, client_tiktok_status FROM clients ORDER BY client_id"
    );
    // Hanya tampilkan yang TikTok aktif (atau bisa filter di SQL)
    const clients = rows.rows.filter((c) => c.client_tiktok_status);
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client TikTok aktif.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client TikTok Aktif*\nBalas angka untuk pilih client:\n\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n   ${
        c.client_tiktok_status ? "🟢 Aktif" : "🔴 Nonaktif"
      }\n\n`;
    });
    session.step = "prosesTiktok_action";
    await waClient.sendMessage(chatId, msg.trim());
  },

  prosesTiktok_action: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent,
    handleFetchKomentarTiktokBatch
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai list."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    session.selected_client_id = client_id;
    session.step = "prosesTiktok_menu";
    await waClient.sendMessage(
      chatId,
      `Proses TikTok untuk *${client_id}*:\n1️⃣ Fetch Konten TikTok\n2️⃣ Fetch Komentar TikTok\n3️⃣ Absensi Komentar TikTok\n4️⃣ Manual Fetch Konten TikTok\nBalas angka menu di atas atau *batal* untuk keluar.`
    );
  },
  prosesTiktok_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent,
    handleFetchKomentarTiktokBatch
  ) => {
    const client_id = session.selected_client_id;
    if (text.trim() === "1") {
      try {
        await fetchAndStoreTiktokContent(client_id);
        await waClient.sendMessage(
          chatId,
          `✅ Selesai fetch TikTok untuk ${client_id}.`
        );
      } catch (e) {
        await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
    } else if (text.trim() === "2") {
      try {
        await handleFetchKomentarTiktokBatch(waClient, chatId, client_id);
        await waClient.sendMessage(
          chatId,
          `✅ Selesai fetch komentar TikTok untuk ${client_id}.`
        );
      } catch (e) {
        await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
    } else if (text.trim() === "3") {
      session.step = "absensiKomentar_choose_submenu";
      session.absensi_client_id = client_id;
      let msg = `Pilih tipe rekap absensi komentar TikTok:\n1. Akumulasi (Semua)\n2. Hanya Sudah\n3. Hanya Belum\n4. Per Konten (Semua)\n5. Per Konten Sudah\n6. Per Konten Belum\nBalas angka di atas.`;
      await waClient.sendMessage(chatId, msg);
      return;
    } else if (text.trim() === "4") {
      session.step = "prosesTiktok_manual_prompt";
      await waClient.sendMessage(
        chatId,
        "Kirim link atau video ID TikTok yang ingin disimpan. Ketik *batal* untuk membatalkan."
      );
      return;
    } else {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka menu."
      );
    }
    session.step = "main";
  },

  prosesTiktok_manual_prompt: async (session, chatId, text, waClient) => {
    if (!session.selected_client_id) {
      session.step = "main";
      await waClient.sendMessage(
        chatId,
        "Sesi manual fetch tidak menemukan client. Silakan mulai ulang menu."
      );
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      await waClient.sendMessage(
        chatId,
        "Link TikTok tidak boleh kosong. Kirim ulang atau ketik *batal*."
      );
      return;
    }

    if (trimmed.toLowerCase() === "batal") {
      session.step = "main";
      await waClient.sendMessage(chatId, "Manual fetch TikTok dibatalkan.");
      return;
    }

    try {
      const { fetchAndStoreSingleTiktokPost } = await import(
        "../fetchpost/tiktokFetchPost.js"
      );
      const result = await fetchAndStoreSingleTiktokPost(
        session.selected_client_id,
        trimmed
      );

      const createdLabel = result.createdAt
        ? new Date(result.createdAt).toLocaleString("id-ID", {
            timeZone: "Asia/Jakarta",
          })
        : "-";
      const likeLabel = result.likeCount ?? 0;
      const commentLabel = result.commentCount ?? 0;

      const confirmation = [
        "✅ Konten TikTok berhasil disimpan.",
        `• Client: *${result.clientId}*`,
        `• Video ID: *${result.videoId}*`,
        `• Waktu Upload: ${createdLabel}`,
        `• Likes: ${likeLabel} | Komentar: ${commentLabel}`,
      ];

      if (result.caption) {
        confirmation.push("\nCaption:");
        confirmation.push(
          result.caption.length > 500
            ? `${result.caption.slice(0, 497)}...`
            : result.caption
        );
      }

      await waClient.sendMessage(chatId, confirmation.join("\n"));
      session.step = "main";
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal menyimpan konten TikTok: ${err.message || err}`
      );
      await waClient.sendMessage(
        chatId,
        "Pastikan link benar atau ketik *batal* untuk keluar."
      );
    }
  },

  // ================== ABSENSI USERNAME INSTAGRAM ==================
  absensiUsernameInsta_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    // Pilih client (tambahkan client_status di query)
    const rows = await query(
      "SELECT client_id, nama, client_status FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client*\nBalas angka untuk pilih client:\n\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n   ${
        c.client_status ? "🟢 Aktif" : "🔴 Nonaktif"
      }\n\n`;
    });
    session.step = "absensiUsernameInsta_submenu";
    await waClient.sendMessage(chatId, msg.trim());
  },

  absensiUsernameInsta_submenu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai list."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    session.selected_client_id = client_id;
    session.step = "absensiUsernameInsta_menu";
    let msg = `Absensi Username IG untuk *${client_id}*\n1. Semua\n2. Sudah\n3. Belum\nBalas angka di atas!`;
    await waClient.sendMessage(chatId, msg);
  },
  absensiUsernameInsta_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    const client_id = session.selected_client_id;
    let mode = "all";
    if (text.trim() === "2") mode = "sudah";
    else if (text.trim() === "3") mode = "belum";
    else if (text.trim() !== "1") {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka 1-3."
      );
      return;
    }
    const msg = await absensiUsernameInsta(client_id, userModel, mode);
    await waClient.sendMessage(chatId, msg);
    session.step = "main";
  },

  // ================== ABSENSI USERNAME TIKTOK ==================
  absensiUsernameTiktok_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    // Ambil semua client, sertakan status aktif
    const rows = await query(
      "SELECT client_id, nama, client_status FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client*\nBalas angka untuk pilih client:\n\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n   ${
        c.client_status ? "🟢 Aktif" : "🔴 Nonaktif"
      }\n\n`;
    });
    session.step = "absensiUsernameTiktok_submenu";
    await waClient.sendMessage(chatId, msg.trim());
  },

  absensiUsernameTiktok_menu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    const client_id = session.selected_client_id;
    let mode = "all";
    if (text.trim() === "2") mode = "sudah";
    else if (text.trim() === "3") mode = "belum";
    else if (text.trim() !== "1") {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka 1-3."
      );
      return;
    }
    const msg = await absensiUsernameTiktok(client_id, userModel, mode);
    await waClient.sendMessage(chatId, msg);
    session.step = "main";
  },

  absensiUsernameTiktok_submenu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai list."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    session.selected_client_id = client_id;
    session.step = "absensiUsernameTiktok_menu";
    let msg = `Absensi Username TikTok untuk *${client_id}*\n1. Semua\n2. Sudah\n3. Belum\nBalas angka di atas!`;
    await waClient.sendMessage(chatId, msg);
  },

  // ================== ABSENSI LIKES INSTAGRAM ==================
  absensiLikes_choose_submenu: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet,
    fetchAndStoreInstaContent,
    fetchAndStoreTiktokContent,
    formatClientData,
    fetchAndStoreLikesInstaContent
  ) => {
    const pilihan = parseInt(text.trim());
    const client_id = session.absensi_client_id;
    if (!client_id) {
      await waClient.sendMessage(chatId, "Client belum dipilih.");
      session.step = "main";
      return;
    }
    try {
      let msg = "";
      const absensiLikesPath = "../fetchabsensi/insta/absensiLikesInsta.js";
      if ([1, 2, 3].includes(pilihan)) {
        const { absensiLikes } = await import(absensiLikesPath);
        if (pilihan === 1) msg = await absensiLikes(client_id, { mode: "all" });
        else if (pilihan === 2)
          msg = await absensiLikes(client_id, { mode: "sudah" });
        else if (pilihan === 3)
          msg = await absensiLikes(client_id, { mode: "belum" });
      } else if ([4, 5, 6].includes(pilihan)) {
        const { absensiLikesPerKonten } = await import(absensiLikesPath);
        if (pilihan === 4)
          msg = await absensiLikesPerKonten(client_id, { mode: "all" });
        else if (pilihan === 5)
          msg = await absensiLikesPerKonten(client_id, { mode: "sudah" });
        else if (pilihan === 6)
          msg = await absensiLikesPerKonten(client_id, { mode: "belum" });
      } else {
        await waClient.sendMessage(
          chatId,
          "Pilihan tidak valid. Balas angka 1-6."
        );
        return;
      }
      await waClient.sendMessage(chatId, msg || "Data tidak ditemukan.");
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
  },

  // ================== ABSENSI KOMENTAR TIKTOK ==================
  absensiKomentar_choose_submenu: async (session, chatId, text, waClient) => {
    const pilihan = parseInt(text.trim());
    const client_id = session.absensi_client_id;
    if (!client_id) {
      await waClient.sendMessage(chatId, "Client belum dipilih.");
      session.step = "main";
      return;
    }
    try {
      let msg = "";
      const absensiKomentarPath =
        "../fetchabsensi/tiktok/absensiKomentarTiktok.js";
      if ([1, 2, 3].includes(pilihan)) {
        const { absensiKomentar } = await import(absensiKomentarPath);
        if (pilihan === 1)
          msg = await absensiKomentar(client_id, { mode: "all" });
        else if (pilihan === 2)
          msg = await absensiKomentar(client_id, { mode: "sudah" });
        else if (pilihan === 3)
          msg = await absensiKomentar(client_id, { mode: "belum" });
      } else if ([4, 5, 6].includes(pilihan)) {
        const { absensiKomentarTiktokPerKonten } = await import(
          absensiKomentarPath
        );
        if (pilihan === 4)
          msg = await absensiKomentarTiktokPerKonten(client_id, {
            mode: "all",
          });
        else if (pilihan === 5)
          msg = await absensiKomentarTiktokPerKonten(client_id, {
            mode: "sudah",
          });
        else if (pilihan === 6)
          msg = await absensiKomentarTiktokPerKonten(client_id, {
            mode: "belum",
          });
      } else {
        await waClient.sendMessage(
          chatId,
          "Pilihan tidak valid. Balas angka 1-6."
        );
        return;
      }
      await waClient.sendMessage(chatId, msg || "Data tidak ditemukan.");
    } catch (e) {
      await waClient.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
    session.step = "main";
  },

  // ================== TRANSFER USER FROM FOLDER ==================
  transferUser_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool
  ) => {
    const rows = await query(
      "SELECT client_id, nama FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client — Sumber Folder user_data*\nBalas angka untuk memilih client tujuan migrasi:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "transferUser_action";
  },
  transferUser_action: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai daftar."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    await waClient.sendMessage(
      chatId,
      `⏳ Migrasi user dari folder *user_data/${client_id}/* ke database...`
    );
    try {
      const result = await migrateUsersFromFolder(client_id);
      let report = `*Hasil transfer user dari folder ke client ${client_id}:*\n`;
      result.forEach((r) => {
        report += `- ${r.file}: ${r.status}${
          r.error ? " (" + r.error + ")" : ""}\n`;
      });

      if (result.length > 0 && result.every((r) => r.status === "✅ Sukses")) {
        report += "\n🎉 Semua user berhasil ditransfer!";
      }
      if (result.length === 0) {
        report += "\n(Tidak ada file user yang ditemukan atau diproses)";
      }

      await waClient.sendMessage(chatId, report);
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal proses transfer: ${err.message}`
      );
    }
    session.step = "main";
  },

  // ================== TRANSFER USER VIA SHEET ==================
  transferUserSheet_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool
  ) => {
    const rows = await query(
      "SELECT client_id, nama FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client — Import via Google Sheet*\nBalas angka untuk memilih client tujuan migrasi:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "transferUserSheet_link";
  },
  transferUserSheet_link: async (
    session,
    chatId,
    text,
    waClient,
    pool
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai daftar."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    session.transferSheetClientId = client_id;
    await waClient.sendMessage(
      chatId,
      `Kirim link Google Sheet yang berisi data user untuk diimport ke *${client_id}*:`
    );
    session.step = "transferUserSheet_action";
  },
  transferUserSheet_action: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel,
    clientService,
    migrateUsersFromFolder,
    checkGoogleSheetCsvStatus,
    importUsersFromGoogleSheet
  ) => {
    const sheetUrl = text.trim();
    const client_id = session.transferSheetClientId;
    const check = await checkGoogleSheetCsvStatus(sheetUrl);
    if (!check.ok) {
      await waClient.sendMessage(
        chatId,
        `❌ Sheet tidak bisa diakses:\n${check.reason}`
      );
      return;
    }
    await waClient.sendMessage(
      chatId,
      `⏳ Mengambil & migrasi data dari Google Sheet untuk client *${client_id}*...`
    );
    try {
      const result = await importUsersFromGoogleSheet(sheetUrl, client_id);
      let report = `*Hasil import user dari Google Sheet ke client ${client_id}:*\n`;
      result.forEach((r) => {
        report += `- ${r.user_id}: ${r.status}${
          r.error ? " (" + r.error + ")" : ""}\n`;
      });
      if (result.length > 0 && result.every((r) => r.status === "✅ Sukses")) {
        report += "\n🎉 Semua user berhasil ditransfer!";
      }
      if (result.length === 0) {
        report += "\n(Tidak ada data user pada sheet)";
      }
      await waClient.sendMessage(chatId, report);
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal import: ${err.message}`);
    }
    session.step = "main";
  },

  // ================== DOWNLOAD SHEET AMPLIFIKASI ==================
  downloadSheet_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool
  ) => {
    const rows = await query(
      "SELECT client_id, nama FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client*\nBalas angka untuk memilih:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "downloadSheet_action";
  },
  downloadSheet_action: async (
    session,
    chatId,
    text,
    waClient
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai daftar."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    session.step = "main";
    await waClient.sendMessage(chatId, "⏳ Menyiapkan file Excel...");
    try {
      const rows = await linkReportModel.getReportsThisMonthByClient(client_id);
      const monthName = new Date().toLocaleString("id-ID", {
        month: "long",
        timeZone: "Asia/Jakarta"
      });
      const filePath = await saveLinkReportExcel(rows, client_id, monthName);
      const buffer = await fs.readFile(filePath);
      await sendWAFile(
        waClient,
        buffer,
        path.basename(filePath),
        getAdminWAIds(),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      await waClient.sendMessage(chatId, "✅ File Excel dikirim ke admin.");
      await fs.unlink(filePath);
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal membuat Excel: ${err.message}`);
      console.error(err);
    }
  },

  // =========== DOWNLOAD SHEET AMPLIFIKASI BULAN SEBELUMNYA ===========
  downloadSheetPrev_choose: async (
    session,
    chatId,
    text,
    waClient,
    pool
  ) => {
    const rows = await query(
      "SELECT client_id, nama FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client*\nBalas angka untuk memilih:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "downloadSheetPrev_action";
  },
  downloadSheetPrev_action: async (
    session,
    chatId,
    text,
    waClient
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai daftar."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    session.step = "main";
    await waClient.sendMessage(chatId, "⏳ Menyiapkan file Excel...");
    try {
      const rows = await linkReportModel.getReportsPrevMonthByClient(client_id);
      const date = new Date();
      date.setMonth(date.getMonth() - 1);
      const monthName = date.toLocaleString("id-ID", {
        month: "long",
        timeZone: "Asia/Jakarta",
      });
      const filePath = await saveLinkReportExcel(rows, client_id, monthName);
      const buffer = await fs.readFile(filePath);
      await sendWAFile(
        waClient,
        buffer,
        path.basename(filePath),
        getAdminWAIds(),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      await waClient.sendMessage(chatId, "✅ File Excel dikirim ke admin.");
      await fs.unlink(filePath);
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal membuat Excel: ${err.message}`);
      console.error(err);
    }
  },

  // ================== DOWNLOAD DOCS ==================
  downloadDocs_choose: async (session, chatId, _text, waClient) => {
    const msg = `*Download Dokumentasi*\n1️⃣ Front End\n2️⃣ Back End\nBalas angka menu atau *batal* untuk keluar.`;
    session.step = "downloadDocs_send";
    await waClient.sendMessage(chatId, msg);
  },
  downloadDocs_send: async (session, chatId, text, waClient) => {
    const choice = text.trim();
    let targetDir = "";
    let filename = "";
    if (choice === "1") {
      targetDir = path.join(process.cwd(), "..", "Cicero_Web");
      filename = "frontend-docs.pdf";
    } else if (choice === "2") {
      targetDir = process.cwd();
      filename = "backend-docs.pdf";
    } else if (choice.toLowerCase() === "batal") {
      session.step = "main";
      await waClient.sendMessage(chatId, "Dibatalkan.");
      return;
    } else {
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Balas *1* atau *2*.");
      return;
    }
    session.step = "main";
    try {
      await fs.access(targetDir);
    } catch (_e) {
      await waClient.sendMessage(chatId, "❌ Folder tidak ditemukan.");
      return;
    }
    try {
      await waClient.sendMessage(chatId, "⏳ Menyiapkan dokumen...");
      const buffer = await buildDocsPdf(targetDir, filename);
      await sendWAFile(waClient, buffer, filename, chatId, "application/pdf");
      await waClient.sendMessage(chatId, "✅ Dokumen dikirim.");
    } catch (err) {
      await waClient.sendMessage(chatId, `❌ Gagal membuat dokumen: ${err.message}`);
    }
  },

  // ================== EXCEPTION INFO ==================
  exceptionInfo_chooseClient: async (
    session,
    chatId,
    text,
    waClient,
    pool
  ) => {
    const rows = await query(
      "SELECT client_id, nama FROM clients ORDER BY client_id"
    );
    const clients = rows.rows;
    if (!clients.length) {
      await waClient.sendMessage(chatId, "Tidak ada client terdaftar.");
      session.step = "main";
      return;
    }
    session.clientList = clients;
    let msg = `*Daftar Client*\nBalas angka untuk pilih client:\n`;
    clients.forEach((c, i) => {
      msg += `${i + 1}. *${c.client_id}* - ${c.nama}\n`;
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "exceptionInfo_show";
  },
  exceptionInfo_show: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    const idx = parseInt(text.trim()) - 1;
    const clients = session.clientList || [];
    if (isNaN(idx) || !clients[idx]) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka sesuai daftar."
      );
      return;
    }
    const client_id = clients[idx].client_id;
    let users = await userModel.getExceptionUsersByClient(client_id);
    if (!users.length) {
      await waClient.sendMessage(
        chatId,
        `Tidak ada user exception untuk *${client_id}*.`
      );
      session.step = "main";
      return;
    }
    let msg = `*Daftar User Exception*\nClient: *${client_id}*\nTotal: ${users.length}\n`;
    const byDiv = groupByDivision(users);
    const keys = sortDivisionKeys(Object.keys(byDiv));
    keys.forEach((div) => {
      msg += `\n*${div}* (${byDiv[div].length} user):\n`;
      msg += byDiv[div]
        .map((u) => `- ${formatNama(u)} (${u.user_id})`)
        .join("\n");
      msg += "\n";
    });
    await waClient.sendMessage(chatId, msg.trim());
    session.step = "main";
  },

  // ================== HAPUS WA USER ==================
  hapusWAUser_start: async (session, chatId, text, waClient) => {
    session.step = "hapusWAUser_nrp";
    await waClient.sendMessage(
      chatId,
      "Masukkan *user_id* / NRP/NIP yang akan dihapus WhatsApp-nya:"
    );
  },
  hapusWAUser_nrp: async (session, chatId, text, waClient) => {
    session.target_user_id = text.trim();
    session.step = "hapusWAUser_confirm";
    await waClient.sendMessage(
      chatId,
      `Konfirmasi hapus WhatsApp untuk user *${session.target_user_id}*? Balas *ya* untuk melanjutkan atau *tidak* untuk membatalkan.`
    );
  },
  hapusWAUser_confirm: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    if (text.trim().toLowerCase() !== "ya") {
      await waClient.sendMessage(chatId, "Dibatalkan.");
      session.step = "main";
      return;
    }
    try {
      await userModel.updateUserField(session.target_user_id, "whatsapp", "");
      await waClient.sendMessage(
        chatId,
        `✅ WhatsApp untuk user ${session.target_user_id} berhasil dihapus.`
      );
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal menghapus WhatsApp user: ${err.message}`
      );
    }
    session.step = "main";
  },

  // ================== HAPUS WA ADMIN ==================
  hapusWAAdmin_confirm: async (session, chatId, text, waClient) => {
    session.step = "hapusWAAdmin_execute";
    await waClient.sendMessage(
      chatId,
      "⚠️ Semua user dengan nomor WhatsApp yang sama seperti ADMIN_WHATSAPP akan dihapus field WhatsApp-nya.\nBalas *ya* untuk melanjutkan atau *tidak* untuk membatalkan."
    );
  },
  hapusWAAdmin_execute: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    if (text.trim().toLowerCase() !== "ya") {
      await waClient.sendMessage(chatId, "Dibatalkan.");
      session.step = "main";
      return;
    }
    try {
      const numbers0 = getAdminWANumbers();
      const numbers62 = numbers0.map((n) =>
        n.startsWith("0") ? "62" + n.slice(1) : n
      );
      const targets = Array.from(new Set([...numbers0, ...numbers62]));
      const updated = await userModel.clearUsersWithAdminWA(targets);
      await waClient.sendMessage(
        chatId,
        `✅ WhatsApp dikosongkan untuk ${updated.length} user.`
      );
    } catch (err) {
      await waClient.sendMessage(
        chatId,
        `❌ Gagal menghapus WA admin: ${err.message}`
      );
    }
    session.step = "main";
  },

  // ================== BULK STATUS USER ==================
  bulkStatus_prompt: async (session, chatId, _text, waClient) => {
    session.step = "bulkStatus_process";
    const exampleLines = [
      "Permohonan Penghapusan Data Personil – SATKER",
      "",
      "1. Nama Personel – 75020201 – mutasi",
      "2. Nama Personel – 75020202 – pensiun",
      "3. Nama Personel – 75020203 – double data",
    ];
    await waClient.sendMessage(
      chatId,
      [
        "Kirimkan template *Permohonan Penghapusan Data Personil – ...* dari satker yang bersangkutan.",
        "Gunakan format daftar berikut agar dapat diproses otomatis:",
        "",
        ...exampleLines,
        "",
        "Tuliskan alasan asli (mis. mutasi/pensiun/double data).",
        "Balas *batal* untuk membatalkan.",
      ].join("\n")
    );
  },
  bulkStatus_process: async (
    session,
    chatId,
    text,
    waClient,
    pool,
    userModel
  ) => {
    const trimmed = text.trim();
    if (!trimmed) {
      await waClient.sendMessage(
        chatId,
        "Format tidak dikenali. Mohon kirimkan template lengkap atau ketik *batal*."
      );
      return;
    }
    if (trimmed.toLowerCase() === "batal") {
      await waClient.sendMessage(chatId, "Permohonan penghapusan dibatalkan.");
      session.step = "main";
      return;
    }
    if (!BULK_STATUS_HEADER_REGEX.test(trimmed)) {
      await waClient.sendMessage(
        chatId,
        "Pesan tidak memuat judul *Permohonan Penghapusan Data Personil*. Mohon gunakan template resmi."
      );
      return;
    }

    const { entries, headerLine } = parseBulkStatusEntries(trimmed);
    if (!entries.length) {
      await waClient.sendMessage(
        chatId,
        "Tidak menemukan daftar personel. Pastikan format setiap baris: `1. NAMA – USER_ID – alasan`."
      );
      return;
    }

    const successes = [];
    const failures = [];

    for (const entry of entries) {
      const normalizedId = normalizeUserId(entry.rawId);
      const fallbackName = entry.name || "";
      if (!normalizedId) {
        failures.push({
          ...entry,
          name: fallbackName,
          userId: "",
          error: "user_id tidak valid",
        });
        continue;
      }

      let dbUser;
      try {
        dbUser = await userModel.findUserById(normalizedId);
      } catch (err) {
        failures.push({
          ...entry,
          name: fallbackName,
          userId: normalizedId,
          error: `gagal mengambil data user: ${err?.message || String(err)}`,
        });
        continue;
      }

      if (!dbUser) {
        failures.push({
          ...entry,
          name: fallbackName,
          userId: normalizedId,
          error: "user tidak ditemukan",
        });
        continue;
      }

      const officialName =
        formatNama(dbUser) || dbUser.nama || fallbackName || normalizedId;

      try {
        await userModel.updateUserField(normalizedId, "status", false);
      } catch (err) {
        failures.push({
          ...entry,
          name: officialName,
          userId: normalizedId,
          error: err?.message || String(err),
        });
        continue;
      }

      try {
        await userModel.updateUserField(normalizedId, "whatsapp", "");
      } catch (err) {
        const note = err?.message || String(err);
        failures.push({
          ...entry,
          name: officialName,
          userId: normalizedId,
          error: `status dinonaktifkan, namun gagal mengosongkan WhatsApp: ${note}`,
        });
        continue;
      }

      successes.push({
        ...entry,
        name: officialName,
        userId: normalizedId,
      });
    }

    const lines = [];
    const title = headerLine || "Permohonan Penghapusan Data Personil";
    lines.push(`📄 *${title}*`);

    if (successes.length) {
      lines.push("", `✅ Status dinonaktifkan untuk ${successes.length} personel:`);
      successes.forEach(({ userId, name, reason, rawId }) => {
        const displayName = name || rawId || userId;
        const reasonLabel = reason ? ` • ${reason}` : "";
        lines.push(`- ${userId} (${displayName})${reasonLabel}`);
      });
    }

    if (failures.length) {
      lines.push(
        "",
        `❌ ${failures.length} entri gagal diproses:`
      );
      failures.forEach(({ rawId, userId, name, reason, error }) => {
        const idLabel = userId || rawId || "-";
        const displayName = name || idLabel;
        const reasonLabel = reason ? ` • ${reason}` : "";
        lines.push(`- ${idLabel} (${displayName})${reasonLabel} → ${error}`);
      });
    }

    lines.push("", "Selesai diproses. Terima kasih.");

    await waClient.sendMessage(chatId, lines.join("\n").trim());
    session.step = "main";
  },

  // ================== RESPONSE KOMPLAIN ==================
  respondComplaint_start: async (session, chatId, _text, waClient) => {
    session.respondComplaint = {};
    session.step = "respondComplaint_message";
    await waClient.sendMessage(
      chatId,
      [
        "Kirimkan *pesan komplain lengkap* dari pelapor dengan format seperti di bawah ini:",
        "",
        "Pesan Komplain",
        "NRP    : 75020201",
        "Nama   : Nama Pelapor",
        "Polres : Satuan",
        "Username IG : @username",
        "Username TikTok : @username",
        "",
        "Kendala",
        "- Sudah melaksanakan Instagram belum terdata.",
        "- Sudah melaksanakan TikTok belum terdata.",
        "",
        "Atau ketik *batal* untuk keluar."
      ].join("\n")
    );
  },
  respondComplaint_message: async (
    session,
    chatId,
    text,
    waClient,
    _pool,
    userModel
  ) => {
    const input = text.trim();
    if (!input) {
      await waClient.sendMessage(
        chatId,
        "Pesan komplain tidak boleh kosong. Kirimkan pesan komplain atau ketik *batal* untuk keluar."
      );
      return;
    }
    if (input.toLowerCase() === "batal") {
      delete session.respondComplaint;
      session.step = "main";
      await waClient.sendMessage(chatId, "Respon komplain dibatalkan.");
      return;
    }
    const parsedComplaint = parseComplaintMessage(text);
    const nrp = normalizeUserId(parsedComplaint.nrp || "");
    if (!nrp) {
      await waClient.sendMessage(
        chatId,
        "Format NRP/NIP tidak ditemukan atau tidak valid pada pesan komplain. Mohon periksa kembali dan kirim ulang."
      );
      return;
    }
    const user = await userModel.findUserById(nrp);
    if (!user) {
      await waClient.sendMessage(
        chatId,
        `User dengan NRP ${nrp} tidak ditemukan. Coba lagi atau ketik *batal* untuk keluar.`
      );
      return;
    }

    const userSummary = [
      "👤 *Data Pelapor*",
      formatUserData(user),
    ].join("\n");
    await waClient.sendMessage(chatId, userSummary);

    const whatsappNumber = user?.whatsapp ? String(user.whatsapp).trim() : "";
    const normalizedEmail = normalizeEmail(user?.email);
    const hasWhatsapp = Boolean(whatsappNumber);
    const hasEmail = Boolean(normalizedEmail);

    if (!hasWhatsapp && !hasEmail) {
      await waClient.sendMessage(
        chatId,
        `User *${nrp}* (${formatNama(user) || user.nama || "-"}) belum memiliki nomor WhatsApp terdaftar. Masukkan NRP lain atau ketik *batal* untuk keluar.`
      );
      return;
    }
    const contactChannel = hasWhatsapp ? "whatsapp" : "email";
    session.respondComplaint = {
      ...(session.respondComplaint || {}),
      nrp,
      user,
      channel: contactChannel,
    };
    const instaUsername =
      typeof user.insta === "string" ? user.insta.trim() : user.insta || "";
    const tiktokUsername =
      typeof user.tiktok === "string" ? user.tiktok.trim() : user.tiktok || "";
    const hasInsta = Boolean(instaUsername);
    const hasTiktok = Boolean(tiktokUsername);

    const formattedComplaint = formatComplaintIssue(parsedComplaint.raw);
    if (formattedComplaint) {
      await waClient.sendMessage(chatId, formattedComplaint);
    }

    if (!isUserActive(user)) {
      const solution = [
        "Akun Cicero personel saat ini *tidak aktif*.",
        "Mohon hubungi operator satker untuk melakukan aktivasi akun sebelum melanjutkan pelaporan tugas atau komplain.",
        "Setelah akun aktif, silakan informasikan kembali melalui menu *Client Request* bila kendala masih terjadi.",
      ].join("\n");

      session.respondComplaint = {
        ...(session.respondComplaint || {}),
        nrp,
        user,
        accountStatus: null,
        issue: formattedComplaint || "Akun personel tidak aktif.",
        solution,
        parsedComplaint,
      };

      await processComplaintResolution(session, chatId, waClient);
      return;
    }

    const accountStatus = await buildAccountStatus(user);
    if (accountStatus.adminMessage) {
      await waClient.sendMessage(chatId, accountStatus.adminMessage);
    }

    if (!hasInsta && !hasTiktok) {
      session.respondComplaint = {
        ...(session.respondComplaint || {}),
        nrp,
        user,
        accountStatus,
        issue: "Akun sosial media masih belum terisi",
        solution: [
          "Belum terdapat username Instagram maupun TikTok pada data personel.",
          "",
          "Langkah tindak lanjut:",
          buildUpdateDataInstructions("Instagram dan TikTok"),
          "",
          `Tautan update data personel: ${UPDATE_DATA_LINK}`,
        ].join("\n"),
      };

      await processComplaintResolution(session, chatId, waClient);
      return;
    }
    const complaintIssues = Array.isArray(parsedComplaint.issues)
      ? parsedComplaint.issues.filter((issue) => issue && issue.trim())
      : [];
    const formattedIssues = complaintIssues.length
      ? formatComplaintIssue(
          [
            "Pesan Komplain",
            `NRP/NIP: ${nrp}`,
            parsedComplaint.name ? `Nama: ${parsedComplaint.name}` : "",
            parsedComplaint.polres ? `Polres: ${parsedComplaint.polres}` : "",
            parsedComplaint.instagram
              ? `Instagram: ${parsedComplaint.instagram}`
              : "",
            parsedComplaint.tiktok ? `TikTok: ${parsedComplaint.tiktok}` : "",
            "",
            "Kendala",
            ...complaintIssues.map((issue) => `- ${issue}`),
          ]
            .filter(Boolean)
            .join("\n")
        )
      : formatComplaintIssue(parsedComplaint.raw);

    session.respondComplaint = {
      ...(session.respondComplaint || {}),
      nrp,
      user,
      accountStatus,
      issue: formattedIssues,
      parsedComplaint,
    };

    const { solutionText } = await buildComplaintSolutionsFromIssues(
      parsedComplaint,
      user,
      accountStatus
    );

    if (solutionText) {
      session.respondComplaint.solution = solutionText;
      await processComplaintResolution(session, chatId, waClient);
      return;
    }

    await waClient.sendMessage(
      chatId,
      "Kendala belum memiliki solusi otomatis. Tuliskan *solusi/tindak lanjut* yang akan dikirim ke pelapor (atau ketik *batal* untuk keluar):"
    );
    session.step = "respondComplaint_solution";
  },
  respondComplaint_issue: async (session, chatId, text, waClient) => {
    const input = text.trim();
    if (!input) {
      await waClient.sendMessage(
        chatId,
        "Pesan kendala tidak boleh kosong. Tuliskan kendala atau ketik *batal* untuk keluar."
      );
      return;
    }
    if (input.toLowerCase() === "batal") {
      delete session.respondComplaint;
      session.step = "main";
      await waClient.sendMessage(chatId, "Respon komplain dibatalkan.");
      return;
    }
    const formattedIssue = formatComplaintIssue(input);
    session.respondComplaint = {
      ...(session.respondComplaint || {}),
      issue: formattedIssue,
    };

    if (await maybeHandleAutoSolution(session, chatId, waClient)) {
      return;
    }

    session.step = "respondComplaint_solution";
    await waClient.sendMessage(
      chatId,
      "Tuliskan *solusi/tindak lanjut* yang akan dikirim ke pelapor (atau ketik *batal* untuk keluar):"
    );
  },
  respondComplaint_solution: async (
    session,
    chatId,
    text,
    waClient
  ) => {
    const input = text.trim();
    if (!input) {
      await waClient.sendMessage(
        chatId,
        "Solusi tidak boleh kosong. Tuliskan solusi atau ketik *batal* untuk keluar."
      );
      return;
    }
    if (input.toLowerCase() === "batal") {
      delete session.respondComplaint;
      session.step = "main";
      await waClient.sendMessage(chatId, "Respon komplain dibatalkan.");
      return;
    }
    const data = session.respondComplaint || {};
    const { nrp, user, issue } = data;
    if (!nrp || !user || !issue) {
      delete session.respondComplaint;
      session.step = "main";
      await waClient.sendMessage(
        chatId,
        "Data komplain tidak lengkap. Silakan mulai ulang proses respon komplain."
      );
      return;
    }
    const solution = input;
    session.respondComplaint = {
      ...data,
      solution,
    };
    await processComplaintResolution(session, chatId, waClient);
  },

  // ================== ABSENSI OPERATOR DITBINMAS ==================
  absensiOprDitbinmas: async (session, chatId, _text, waClient) => {
    const msg = await absensiRegistrasiDashboardDitbinmas();
    await waClient.sendMessage(chatId, msg);
    session.step = "main";
  },


  // ================== LAINNYA ==================
  lainnya_menu: async (session, chatId, text, waClient) => {
    await waClient.sendMessage(chatId, "Fitur lain belum tersedia.");
    session.step = "main";
  },
};

export { normalizeComplaintHandle, parseComplaintMessage, parseBulkStatusEntries };

export default clientRequestHandlers;
