import { getUsersSocialByClient, getClientsByRole } from "../../model/userModel.js";
import { getShortcodesTodayByClient } from "../../model/instaPostModel.js";
import { getVideoIdsTodayByClient } from "../../model/tiktokPostModel.js";
import { getRekapLikesByClient } from "../../model/instaLikeModel.js";
import { getRekapKomentarByClient } from "../../model/tiktokCommentModel.js";
import {
  absensiLikes,
  lapharDitbinmas,
  absensiLikesDitbinmasReport,
  collectLikesRecap,
  absensiLikesDitbinmasSimple as absensiLikesDitbinmasSimpleReport,
} from "../fetchabsensi/insta/absensiLikesInsta.js";
import {
  lapharTiktokDitbinmas,
  collectKomentarRecap,
  absensiKomentarDitbinmasReport,
  absensiKomentar,
  absensiKomentarDitbinmasSimple as absensiKomentarDitbinmasSimpleReport,
} from "../fetchabsensi/tiktok/absensiKomentarTiktok.js";
import { absensiRegistrasiDashboardDitbinmas } from "../fetchabsensi/dashboard/absensiRegistrasiDashboardDitbinmas.js";
import { findClientById } from "../../service/clientService.js";
import { getGreeting, sortDivisionKeys, formatNama } from "../../utils/utilsHelper.js";
import { sendWAFile, safeSendMessage } from "../../utils/waHelper.js";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join, basename } from "path";
import {
  saveLikesRecapExcel,
  saveLikesRecapPerContentExcel,
} from "../../service/likesRecapExcelService.js";
import {
  saveCommentRecapExcel,
  saveCommentRecapPerContentExcel,
} from "../../service/commentRecapExcelService.js";
import { saveWeeklyLikesRecapExcel } from "../../service/weeklyLikesRecapExcelService.js";
import { saveWeeklyCommentRecapExcel } from "../../service/weeklyCommentRecapExcelService.js";
import { generateWeeklyInstagramHighLowReport } from "../../service/weeklyInstagramHighLowService.js";
import { generateWeeklyTiktokHighLowReport } from "../../service/weeklyTiktokHighLowService.js";
import { saveMonthlyLikesRecapExcel } from "../../service/monthlyLikesRecapExcelService.js";
import { saveSatkerUpdateMatrixExcel } from "../../service/satkerUpdateMatrixService.js";
import { saveEngagementRankingExcel } from "../../service/engagementRankingExcelService.js";
import { generateKasatkerReport } from "../../service/kasatkerReportService.js";
import { hariIndo } from "../../utils/constants.js";

const dirRequestGroup = "120363419830216549@g.us";
const DITBINMAS_CLIENT_ID = "DITBINMAS";

const isDitbinmas = (value) =>
  String(value || "")
    .trim()
    .toUpperCase() === DITBINMAS_CLIENT_ID;

const ENGAGEMENT_RECAP_PERIOD_MAP = {
  "1": {
    period: "today",
    label: "hari ini",
    description: "Hari ini",
  },
  "2": {
    period: "yesterday",
    label: "hari sebelumnya",
    description: "Hari sebelumnya",
  },
  "3": {
    period: "this_week",
    label: "minggu ini",
    description: "Minggu ini",
  },
  "4": {
    period: "last_week",
    label: "minggu sebelumnya",
    description: "Minggu sebelumnya",
  },
  "5": {
    period: "this_month",
    label: "bulan ini",
    description: "Bulan ini",
  },
  "6": {
    period: "last_month",
    label: "bulan sebelumnya",
    description: "Bulan sebelumnya",
  },
};

const KASATKER_REPORT_PERIOD_MAP = {
  "1": {
    period: "today",
    label: "hari ini",
    description: "Laporan harian (periode hari ini)",
  },
  "2": {
    period: "this_week",
    label: "minggu ini",
    description: "Laporan mingguan (periode minggu ini)",
  },
  "3": {
    period: "this_month",
    label: "bulan ini",
    description: "Laporan bulanan (periode bulan ini)",
  },
  "4": {
    period: "all_time",
    label: "semua periode",
    description: "Laporan semua periode (seluruh data)",
  },
};

const DIGIT_EMOJI = {
  "0": "0️⃣",
  "1": "1️⃣",
  "2": "2️⃣",
  "3": "3️⃣",
  "4": "4️⃣",
  "5": "5️⃣",
  "6": "6️⃣",
  "7": "7️⃣",
  "8": "8️⃣",
  "9": "9️⃣",
};

const ENGAGEMENT_RECAP_MENU_TEXT =
  "Silakan pilih periode rekap ranking engagement jajaran:\n" +
  Object.entries(ENGAGEMENT_RECAP_PERIOD_MAP)
    .map(([key, option]) => `${DIGIT_EMOJI[key] || key} ${option.description}`)
    .join("\n") +
  "\n\nBalas angka pilihan atau ketik *batal* untuk kembali.";

const KASATKER_REPORT_MENU_TEXT =
  "Silakan pilih periode Laporan Kasatker:\n" +
  Object.entries(KASATKER_REPORT_PERIOD_MAP)
    .map(([key, option]) => `${DIGIT_EMOJI[key] || key} ${option.description}`)
    .join("\n") +
  "\n\nBalas angka pilihan atau ketik *batal* untuk kembali.";

const pangkatOrder = [
  "KOMISARIS BESAR POLISI",
  "AKBP",
  "KOMPOL",
  "AKP",
  "IPTU",
  "IPDA",
  "AIPTU",
  "AIPDA",
  "BRIPKA",
  "BRIGADIR",
  "BRIPTU",
  "BRIPDA",
];
const rankIdx = (t) => {
  const i = pangkatOrder.indexOf((t || "").toUpperCase());
  return i === -1 ? pangkatOrder.length : i;
};

async function formatRekapUserData(clientId, roleFlag = null) {
  const directorateRoles = ["ditbinmas", "ditlantas", "bidhumas"];
  const filterRole = directorateRoles.includes(roleFlag?.toLowerCase())
    ? roleFlag
    : null;
  const client = await findClientById(clientId);
  const users = await getUsersSocialByClient(clientId, filterRole);
  const salam = getGreeting();
  const now = new Date();
  const hari = now.toLocaleDateString("id-ID", { weekday: "long" });
  const tanggal = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const jam = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const clientType = client?.client_type?.toLowerCase();
  const isDirektoratView =
    clientType === "direktorat" ||
    directorateRoles.includes(clientId.toLowerCase()) ||
    directorateRoles.includes(roleFlag?.toLowerCase());
  if (isDirektoratView) {
    const groups = {};
    users.forEach((u) => {
      const cid = (u.client_id || "").toLowerCase();
      if (!groups[cid]) groups[cid] = { total: 0, insta: 0, tiktok: 0, complete: 0 };
      groups[cid].total++;
      if (u.insta) groups[cid].insta++;
      if (u.tiktok) groups[cid].tiktok++;
      if (u.insta && u.tiktok) groups[cid].complete++;
    });

    const roleName = (filterRole || clientId).toLowerCase();
    const polresIds = (await getClientsByRole(roleName)) || [];
    const clientIdLower = clientId.toLowerCase();
    const allIds = Array.from(
      new Set([clientIdLower, ...polresIds.map((id) => id.toLowerCase()), ...Object.keys(groups)])
    );

    const entries = await Promise.all(
      allIds.map(async (cid) => {
        const stat =
          groups[cid] || { total: 0, insta: 0, tiktok: 0, complete: 0 };
        const c = await findClientById(cid);
        const name = (c?.nama || cid).toUpperCase();
        return { cid, name, stat };
      })
    );

    const withData = entries.filter(
      (e) => e.cid === "ditbinmas" || e.stat.total > 0
    );
    const noData = entries.filter(
      (e) => e.stat.total === 0 && e.cid !== "ditbinmas"
    );

    withData.sort((a, b) => {
      if (a.cid === "ditbinmas") return -1;
      if (b.cid === "ditbinmas") return 1;
      if (a.stat.complete !== b.stat.complete)
        return b.stat.complete - a.stat.complete;
      if (a.stat.total !== b.stat.total) return b.stat.total - a.stat.total;
      return a.name.localeCompare(b.name);
    });
    noData.sort((a, b) => {
      if (a.cid === "ditbinmas") return -1;
      if (b.cid === "ditbinmas") return 1;
      return a.name.localeCompare(b.name);
    });

    const withDataLines = withData.map(
      (e, idx) =>
        `${idx + 1}. ${e.name}\n\n` +
        `Jumlah Total Personil : ${e.stat.total}\n` +
        `Jumlah Total Personil Sudah Mengisi Instagram : ${e.stat.insta}\n` +
        `Jumlah Total Personil Sudah Mengisi Tiktok : ${e.stat.tiktok}\n` +
        `Jumlah Total Personil Belum Mengisi Instagram : ${e.stat.total - e.stat.insta}\n` +
        `Jumlah Total Personil Belum Mengisi Tiktok : ${e.stat.total - e.stat.tiktok}`
    );
    const noDataLines = noData.map((e, idx) => `${idx + 1}. ${e.name}`);

    const totals = entries.reduce(
      (acc, e) => {
        acc.total += e.stat.total;
        acc.insta += e.stat.insta;
        acc.tiktok += e.stat.tiktok;
        acc.complete += e.stat.complete;
        return acc;
      },
      { total: 0, insta: 0, tiktok: 0, complete: 0 }
    );

    const header =
      `${salam},\n\n` +
      `Mohon ijin Komandan, melaporkan absensi update data personil ${
        (client?.nama || clientId).toUpperCase()
      } pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:`;

    const sections = [
      `Jumlah Total Personil : ${totals.total}\n` +
        `Jumlah Total Personil Sudah Mengisi Instagram : ${totals.insta}\n` +
        `Jumlah Total Personil Sudah Mengisi Tiktok : ${totals.tiktok}\n` +
        `Jumlah Total Personil Belum Mengisi Instagram : ${totals.total - totals.insta}\n` +
        `Jumlah Total Personil Belum Mengisi Tiktok : ${totals.total - totals.tiktok}`,
    ];
    if (withDataLines.length)
      sections.push(`Sudah Input Data:\n\n${withDataLines.join("\n\n")}`);
    if (noDataLines.length)
      sections.push(`Client Belum Input Data:\n${noDataLines.join("\n")}`);
    const body = `\n\n${sections.join("\n\n")}`;

    return `${header}${body}`.trim();
  }

  const complete = {};
  const incomplete = {};
  users.forEach((u) => {
    const div = u.divisi || "-";
    if (u.insta && u.tiktok) {
      if (!complete[div]) complete[div] = [];
      complete[div].push(u);
    } else {
      const missing = [];
      if (!u.insta) missing.push("Instagram kosong");
      if (!u.tiktok) missing.push("TikTok kosong");
      if (!incomplete[div]) incomplete[div] = [];
      incomplete[div].push({ ...u, missing: missing.join(", ") });
    }
  });

  if (clientType === "org") {
    const completeLines = sortDivisionKeys(Object.keys(complete)).map((d) => {
      const list = complete[d]
        .sort((a, b) => rankIdx(a.title) - rankIdx(b.title) || formatNama(a).localeCompare(formatNama(b)))
        .map((u) => formatNama(u))
        .join("\n\n");
      return `${d.toUpperCase()} (${complete[d].length})\n\n${list}`;
    });
    const incompleteLines = sortDivisionKeys(Object.keys(incomplete)).map((d) => {
      const list = incomplete[d]
        .sort((a, b) => rankIdx(a.title) - rankIdx(b.title) || formatNama(a).localeCompare(formatNama(b)))
        .map((u) => `${formatNama(u)}, ${u.missing}`)
        .join("\n\n");
      return `${d.toUpperCase()} (${incomplete[d].length})\n\n${list}`;
    });
    const sections = [];
    if (completeLines.length) sections.push(`Sudah Lengkap :\n\n${completeLines.join("\n\n")}`);
    if (incompleteLines.length) sections.push(`Belum Lengkap:\n\n${incompleteLines.join("\n\n")}`);
    const body = sections.join("\n\n");
    return (
      `${salam},\n\n` +
      `Mohon ijin Komandan, melaporkan absensi update data personil ${
        (client?.nama || clientId).toUpperCase()
      } pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:\n\n` +
      body
    ).trim();
  }

  const completeLines = sortDivisionKeys(Object.keys(complete)).map((d) => {
    const list = complete[d]
      .sort((a, b) => rankIdx(a.title) - rankIdx(b.title) || formatNama(a).localeCompare(formatNama(b)))
      .map((u) => formatNama(u))
      .join("\n\n");
    return `${d}, Sudah lengkap: (${complete[d].length})\n\n${list}`;
  });
  const incompleteLines = sortDivisionKeys(Object.keys(incomplete)).map((d) => {
    const list = incomplete[d]
      .sort((a, b) => rankIdx(a.title) - rankIdx(b.title) || formatNama(a).localeCompare(formatNama(b)))
      .map((u) => `${formatNama(u)}, ${u.missing}`)
      .join("\n\n");
    return `${d}, Belum lengkap: (${incomplete[d].length})\n\n${list}`;
  });

  const body = [...completeLines, ...incompleteLines].filter(Boolean).join("\n\n");

  return (
    `${salam},\n\n` +
    `Mohon ijin Komandan, melaporkan absensi update data personil ${
      (client?.nama || clientId).toUpperCase()
    } pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:\n\n` +
    body
  ).trim();
}

const topRankingDependencies = {
  getRekapLikesByClient,
  getRekapKomentarByClient,
};

const topPersonnelRankingDependencies = topRankingDependencies;
const topPolresRankingDependencies = topRankingDependencies;

async function formatTopPersonnelRanking(clientId, roleFlag = null) {
  const [likesData, commentData] = await Promise.all([
    topPersonnelRankingDependencies.getRekapLikesByClient(
      clientId,
      "semua",
      undefined,
      undefined,
      undefined,
      roleFlag
    ),
    topPersonnelRankingDependencies.getRekapKomentarByClient(
      clientId,
      "semua",
      undefined,
      undefined,
      undefined,
      roleFlag
    ),
  ]);

  const likeRows = Array.isArray(likesData?.rows) ? likesData.rows : [];
  const commentRows = Array.isArray(commentData) ? commentData : [];

  const combined = new Map();
  const ensureEntry = (row) => {
    const fallbackKey = `${(row.client_id || "").toLowerCase()}::${(row.username || "").toLowerCase()}`;
    const key = row.user_id || fallbackKey;
    if (!combined.has(key)) {
      combined.set(key, {
        user_id: row.user_id || "-",
        title: row.title || "-",
        nama: row.nama || "-",
        client_name: row.client_name || row.client_id || "-",
        jumlah_like: 0,
        jumlah_komentar: 0,
      });
    }
    return combined.get(key);
  };

  likeRows.forEach((row) => {
    const entry = ensureEntry(row);
    entry.jumlah_like = (entry.jumlah_like || 0) + parseInt(row.jumlah_like ?? 0, 10);
  });

  commentRows.forEach((row) => {
    const entry = ensureEntry(row);
    entry.jumlah_komentar =
      (entry.jumlah_komentar || 0) + parseInt(row.jumlah_komentar ?? 0, 10);
  });

  const ranked = Array.from(combined.values())
    .map((entry) => ({
      ...entry,
      total: (entry.jumlah_like || 0) + (entry.jumlah_komentar || 0),
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }
      const nameA = formatNama(a) || `${a.nama}`;
      const nameB = formatNama(b) || `${b.nama}`;
      return nameA.localeCompare(nameB);
    });

  if (!ranked.length) {
    return "Tidak ada data ranking like/komentar personel.";
  }

  const lines = ranked.map((entry, index) => {
    const totalFormatted = Number(entry.total).toLocaleString("id-ID");
    return (
      `${index + 1}. Nama: ${entry.nama}` +
      `\n   Pangkat: ${entry.title}` +
      `\n   NRP: ${entry.user_id}` +
      `\n   Kesatuan: ${entry.client_name}` +
      `\n   Total Like/Komentar: ${totalFormatted}`
    );
  });

  return (
    "📊 *Top Ranking Like & Komentar Personel*\n" +
    "Periode: semua\n\n" +
    lines.join("\n\n")
  );
}

async function formatTopPolresRanking(clientId, roleFlag = null) {
  const [likesData, commentData] = await Promise.all([
    topPolresRankingDependencies.getRekapLikesByClient(
      clientId,
      "semua",
      undefined,
      undefined,
      undefined,
      roleFlag
    ),
    topPolresRankingDependencies.getRekapKomentarByClient(
      clientId,
      "semua",
      undefined,
      undefined,
      undefined,
      roleFlag
    ),
  ]);

  const likeRows = Array.isArray(likesData?.rows) ? likesData.rows : [];
  const commentRows = Array.isArray(commentData) ? commentData : [];

  const combined = new Map();
  const ensureEntry = (row) => {
    const rawKey = String(row.client_id || row.client_name || "-")
      .trim()
      .toLowerCase();
    const key = rawKey || "-";
    if (!combined.has(key)) {
      combined.set(key, {
        client_id: row.client_id || "-",
        client_name: String(row.client_name || row.client_id || "-")
          .trim()
          .toUpperCase(),
        jumlah_like: 0,
        jumlah_komentar: 0,
      });
    }
    const entry = combined.get(key);
    if (row.client_id && entry.client_id === "-") {
      entry.client_id = row.client_id;
    }
    if (row.client_name && entry.client_name === "-") {
      entry.client_name = String(row.client_name).trim().toUpperCase();
    }
    return entry;
  };

  likeRows.forEach((row) => {
    const entry = ensureEntry(row);
    entry.jumlah_like =
      (entry.jumlah_like || 0) + parseInt(row.jumlah_like ?? 0, 10);
  });

  commentRows.forEach((row) => {
    const entry = ensureEntry(row);
    entry.jumlah_komentar =
      (entry.jumlah_komentar || 0) + parseInt(row.jumlah_komentar ?? 0, 10);
  });

  const ranked = Array.from(combined.values())
    .map((entry) => ({
      ...entry,
      total: (entry.jumlah_like || 0) + (entry.jumlah_komentar || 0),
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }
      const nameA = String(a.client_name || a.client_id || "");
      const nameB = String(b.client_name || b.client_id || "");
      return nameA.localeCompare(nameB);
    });

  if (!ranked.length) {
    return "Tidak ada data ranking like/komentar polres.";
  }

  const lines = ranked.map((entry, index) => {
    const totalFormatted = Number(entry.total).toLocaleString("id-ID");
    const likeFormatted = Number(entry.jumlah_like || 0).toLocaleString("id-ID");
    const commentFormatted = Number(entry.jumlah_komentar || 0).toLocaleString(
      "id-ID"
    );
    return (
      `${index + 1}. Kesatuan: ${entry.client_name}` +
      `\n   Total Like/Komentar: ${totalFormatted}` +
      `\n   Like: ${likeFormatted} | Komentar: ${commentFormatted}`
    );
  });

  return (
    "📊 *Top Ranking Like & Komentar Polres*\n" +
    "Periode: semua\n\n" +
    lines.join("\n\n")
  );
}

async function absensiLikesDitbinmas() {
  return await absensiLikesDitbinmasReport();
}
async function absensiLikesDitbinmasSimple() {
  return await absensiLikesDitbinmasSimpleReport();
}
async function absensiKomentarTiktok() {
  return await absensiKomentar("DITBINMAS", { roleFlag: "ditbinmas" });
}
async function absensiKomentarDitbinmasSimple() {
  return await absensiKomentarDitbinmasSimpleReport();
}
async function absensiKomentarDitbinmas() {
  return await absensiKomentarDitbinmasReport();
}
async function formatRekapBelumLengkapDitbinmas() {
  const users = await getUsersSocialByClient("DITBINMAS", "ditbinmas");
  const ditbinmasUsers = users.filter(
    (u) => (u.client_id || "").toUpperCase() === "DITBINMAS"
  );
  const salam = getGreeting();
  const now = new Date();
  const hari = now.toLocaleDateString("id-ID", { weekday: "long" });
  const tanggal = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const jam = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const incomplete = {};
  ditbinmasUsers.forEach((u) => {
    if (u.insta && u.tiktok) return;
    const div = u.divisi || "-";
    const missing = [];
    if (!u.insta) missing.push("Instagram kosong");
    if (!u.tiktok) missing.push("TikTok kosong");
    if (!incomplete[div]) incomplete[div] = [];
    incomplete[div].push({ ...u, missing: missing.join(", ") });
  });
  const lines = sortDivisionKeys(Object.keys(incomplete)).map((d) => {
    const list = incomplete[d]
      .sort(
        (a, b) =>
          rankIdx(a.title) - rankIdx(b.title) ||
          formatNama(a).localeCompare(formatNama(b))
      )
      .map((u) => `${formatNama(u)}, ${u.missing}`)
      .join("\n\n");
    return `*${d.toUpperCase()}* (${incomplete[d].length})\n\n${list}`;
  });
  const body = lines.length
    ? lines.join("\n\n")
    : "Seluruh personil telah melengkapi data Instagram dan TikTok.";
  return (
    `${salam},\n\n` +
    `Mohon ijin Komandan, melaporkan personil DITBINMAS yang belum melengkapi data Instagram/TikTok pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:\n\n` +
    body
  ).trim();
}

async function formatExecutiveSummary(clientId, roleFlag = null) {
  const users = await getUsersSocialByClient(clientId, roleFlag);
  const groups = {};
  users.forEach((u) => {
    const cid = String(u.client_id || "").trim().toLowerCase();
    if (!cid) return;
    if (!groups[cid]) groups[cid] = { total: 0, insta: 0, tiktok: 0 };
    groups[cid].total++;
    if (u.insta) groups[cid].insta++;
    if (u.tiktok) groups[cid].tiktok++;
  });
  const stats = await Promise.all(
    Object.entries(groups).map(async ([cid, stat]) => {
      const normalizedCid = String(cid || "").trim().toLowerCase();
      const client = await findClientById(normalizedCid);
      const name = (client?.nama || normalizedCid).toUpperCase();
      const igPct = stat.total ? (stat.insta / stat.total) * 100 : 0;
      const ttPct = stat.total ? (stat.tiktok / stat.total) * 100 : 0;
      return { cid: normalizedCid, name, ...stat, igPct, ttPct };
    })
  );
  const totals = stats.reduce(
    (acc, s) => {
      acc.total += s.total;
      acc.insta += s.insta;
      acc.tiktok += s.tiktok;
      return acc;
    },
    { total: 0, insta: 0, tiktok: 0 }
  );
  const toPercent = (num, den) => (den ? ((num / den) * 100).toFixed(1) : "0.0");
  const arrAvg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const arrMedian = (arr) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };
  const igArr = stats.map((s) => s.igPct);
  const ttArr = stats.map((s) => s.ttPct);
  const avgIg = arrAvg(igArr);
  const avgTt = arrAvg(ttArr);
  const medIg = arrMedian(igArr);
  const medTt = arrMedian(ttArr);
  const lowSatkers = stats.filter((s) => s.igPct < 10 && s.ttPct < 10).length;
  const topSatkers = stats
    .filter((s) => s.igPct >= 90 && s.ttPct >= 90)
    .map((s) => s.name);
  const strongSatkers = stats
    .filter((s) => s.igPct >= 80 && s.ttPct >= 80 && !(s.igPct >= 90 && s.ttPct >= 90))
    .map((s) => `${s.name} (${s.igPct.toFixed(1)}% / ${s.ttPct.toFixed(1)}%)`);
  const sortedAvg = [...stats].sort((a, b) => b.igPct + b.ttPct - (a.igPct + a.ttPct));
  const topPerformers = sortedAvg
    .slice(0, 5)
    .map((s, i) => `${i + 1}) ${s.name} ${s.igPct.toFixed(1)} / ${s.ttPct.toFixed(1)}`);
  const bottomPerformers = sortedAvg
    .slice(-5)
    .map((s) => `${s.name} ${s.igPct.toFixed(1)}% / ${s.ttPct.toFixed(1)}%`);
  const anomalies = stats
    .filter((s) => Math.abs(s.igPct - s.ttPct) >= 15)
    .map((s) => {
      const diff = (s.igPct - s.ttPct).toFixed(1);
      if (s.igPct > s.ttPct)
        return `${s.name} IG ${s.igPct.toFixed(1)}% vs TT ${s.ttPct.toFixed(1)}% (+${diff} poin ke IG)`;
      return `${s.name} IG ${s.igPct.toFixed(1)}% vs TT ${s.ttPct.toFixed(1)}% (${diff} ke IG)`;
    });
  const backlogIg = stats
    .map((s) => ({ name: s.name, count: s.total - s.insta }))
    .sort((a, b) => b.count - a.count);
  const backlogTt = stats
    .map((s) => ({ name: s.name, count: s.total - s.tiktok }))
    .sort((a, b) => b.count - a.count);
  const top10Ig = backlogIg.slice(0, 10);
  const top10Tt = backlogTt.slice(0, 10);
  const top10IgCount = top10Ig.reduce((a, b) => a + b.count, 0);
  const top10TtCount = top10Tt.reduce((a, b) => a + b.count, 0);
  const missingIg = totals.total - totals.insta;
  const missingTt = totals.total - totals.tiktok;
  const percentTopIg = missingIg ? ((top10IgCount / missingIg) * 100).toFixed(1) : "0.0";
  const percentTopTt = missingTt ? ((top10TtCount / missingTt) * 100).toFixed(1) : "0.0";
  const projectedIg = ((totals.insta + 0.7 * top10IgCount) / totals.total) * 100;
  const projectedTt = ((totals.tiktok + 0.7 * top10TtCount) / totals.total) * 100;
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const lines = [
    "Mohon Ijin Komandan,",
    "",
    `*Rekap User Insight ${dateStr} ${timeStr} WIB*`,
    `*Personil Saat ini:* ${totals.total.toLocaleString("id-ID")} personil`,
    "",
    `*Cakupan keseluruhan:* IG ${toPercent(totals.insta, totals.total)}% (${totals.insta}/${totals.total}), TT ${toPercent(totals.tiktok, totals.total)}% (${totals.tiktok}/${totals.total}).`,
    "",
    `*Rata-rata satker:* IG ${avgIg.toFixed(1)}% (median ${medIg.toFixed(1)}%), TT ${avgTt.toFixed(1)}% (median ${medTt.toFixed(1)}%)${
      lowSatkers ? " → *penyebaran masih lebar, banyak satker di bawah 10%.*" : ""
    }`,
  ];
  if (topSatkers.length)
    lines.push("", `*Satker dengan capaian terbaik (≥90% IG & TT):* ${topSatkers.join(", ")}.`);
  if (strongSatkers.length)
    lines.push("", `*Tambahan kuat (≥80% IG & TT):* ${strongSatkers.join(", ")}.`);
  if (topPerformers.length || bottomPerformers.length)
    lines.push("", "*Highlight Pencapaian & Masalah*");
  if (topPerformers.length)
    lines.push("", `*Top performer* (rata-rata IG/TT): ${topPerformers.join(", ")}.`);
  if (bottomPerformers.length)
    lines.push(
      "",
      `*Bottom performer* (rata-rata IG/TT, sangat rendah di kedua platform): ${bottomPerformers.join(" • ")}`
    );
  if (anomalies.length)
    lines.push("", "*Anomali :*", anomalies.map((a) => `*${a}*`).join("\n"));
  lines.push("", "*Konsentrasi Backlog (prioritas penanganan)*", "");
  lines.push(
    `Top-10 penyumbang backlog menyerap >50% backlog masing-masing platform.`
  );
  if (missingIg)
    lines.push(
      "",
      `*IG Belum Diisi (${missingIg}) – 10 terbesar (≈${percentTopIg}%):*`,
      top10Ig.map((s) => `${s.name} (${s.count})`).join(", ")
    );
  if (missingTt)
    lines.push(
      "",
      `*TikTok Belum Diisi (${missingTt}) – 10 terbesar (≈${percentTopTt}%):*`,
      top10Tt.map((s) => `${s.name} (${s.count})`).join(", ")
    );
  lines.push(
    "",
    `*Proyeksi dampak cepat:* Menutup 70% backlog di Top-10 → proyeksi capaian naik ke IG ≈ ${projectedIg.toFixed(
      1
    )}% dan TT ≈ ${projectedTt.toFixed(1)}%.`
  );
  const backlogNames = top10Ig.slice(0, 6).map((s) => s.name);
  const ttBetter = stats
    .filter((s) => s.ttPct - s.igPct >= 10)
    .map((s) => s.name);
  const roleModel = topSatkers;
  if (backlogNames.length || anomalies.length || ttBetter.length || roleModel.length)
    lines.push("", "*Catatan per Satker*");
  if (backlogNames.length)
    lines.push("", `*Backlog terbesar:* ${backlogNames.join(", ")}.`);
  if (ttBetter.length)
    lines.push("", `*TT unggul:* ${ttBetter.join(", ")} (pertahankan).`);
  if (roleModel.length)
    lines.push(
      "",
      `*Role model:* ${roleModel.join(", ")} — didorong menjadi mentor lintas satker.`
    );
  lines.push(
    "",
    "_Catatan kaki:_ IG = Instagram; TT = TikTok; backlog = pekerjaan tertunda / User Belum Update data;"
  );
return lines.join("\n").trim();
}

function formatRekapAllSosmed(igNarrative, ttNarrative) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const normalizeText = (text) => (text || "").replace(/\r\n/g, "\n");
  const parseNumber = (value) => {
    if (!value) return null;
    const normalized = value.replace(/\./g, "").replace(/,/g, ".");
    const num = Number.parseFloat(normalized);
    return Number.isNaN(num) ? null : num;
  };
  const formatInteger = (value) =>
    value == null
      ? null
      : Math.round(value).toLocaleString("id-ID", { maximumFractionDigits: 0 });
  const formatPercent = (value) =>
    value == null
      ? null
      : value.toLocaleString("id-ID", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
  const formatRatio = (numerator, denominator, percent) => {
    if (numerator == null || denominator == null)
      return null;
    const parts = [
      `${formatInteger(numerator)}/${formatInteger(denominator)}`,
    ];
    if (percent != null) parts.push(`(${formatPercent(percent)}%)`);
    return parts.join(" ");
  };

  const cleanContentLine = (line) =>
    line ? line.replace(/^\d+\.\s*/, "").trim() : null;

  const stripTrailingPunctuation = (text) =>
    text ? text.replace(/[.;:,]+\s*$/u, "").trim() : text;

  const combineSentences = (segments) =>
    segments
      .map((segment) => (segment || "").trim())
      .filter(Boolean)
      .join(" ");

  const indentParagraphs = (paragraphs) =>
    paragraphs
      .map((paragraph) => (paragraph || "").trim())
      .filter(Boolean)
      .flatMap((paragraph, index, array) => {
        const lines = paragraph
          .split("\n")
          .map((line) => `   ${line.trim()}`)
          .filter((line) => line.trim() !== "");
        if (index < array.length - 1) return [...lines, ""];
        return lines;
      });

  const extractIgData = (text) => {
    const normalized = normalizeText(text);
    const data = {};

    const kontenMatch = normalized.match(/Jumlah konten aktif:\s*([\d.,]+)/i);
    if (kontenMatch) data.contentCount = parseNumber(kontenMatch[1]);

    const likeMatch = normalized.match(
      /Total likes:\s*([\d.,]+)\s+dari\s+([\d.,]+)[^()]*\(([\d.,]+)%/i
    );
    if (likeMatch) {
      data.totalLikes = parseNumber(likeMatch[1]);
      data.totalLikesTarget = parseNumber(likeMatch[2]);
      data.likePercent = parseNumber(likeMatch[3]);
    }

    const targetMatch = normalized.match(
      /Target harian ≥95%:\s*([\d.,]+)\s+likes(?:\s*→\s*kekurangan\s*([\d.,]+))?/i
    );
    if (targetMatch) {
      data.targetLikes = parseNumber(targetMatch[1]);
      data.likeGap = parseNumber(targetMatch[2]);
      data.targetAchieved =
        /target tercapai/i.test(targetMatch[0]) ||
        (data.likeGap != null && data.likeGap <= 0);
    }

    const rataMatch = normalized.match(
      /Rata-rata likes\/konten:\s*([\d.,]+)/i
    );
    if (rataMatch) data.avgLikesPerContent = parseNumber(rataMatch[1]);

    const gapKontenMatch = normalized.match(
      /Rata-rata likes\/konten:[^\n]*;\s*([^\n]+)/i
    );
    if (gapKontenMatch) data.contentGapLine = gapKontenMatch[1].trim();

    const contribMatch = normalized.match(
      /Kontributor likes terbesar:\s*([^\n]+)/i
    );
    if (contribMatch) data.topContributor = contribMatch[1].trim();

    const distribMatch = normalized.match(
      /Distribusi likes per konten:\s*([\s\S]*?)(?:\n#|\nDemikian|$)/i
    );
    if (distribMatch) {
      const distribLines = distribMatch[1]
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      data.topContentLine = distribLines.find((line) => /1\./.test(line)) || "";
      data.otherContentLines = distribLines.slice(1);
    }

    const personilMatch = normalized.match(
      /Personil tercatat:\s*([\d.,]+)\s*→\s*IG\s*([\d.,]+)%\s*\(([\d.,]+)\),\s*TT\s*([\d.,]+)%\s*\(([\d.,]+)\)/i
    );
    if (personilMatch) {
      data.personilTotal = parseNumber(personilMatch[1]);
      data.personilIgPercent = parseNumber(personilMatch[2]);
      data.personilIgCount = parseNumber(personilMatch[3]);
      data.personilTtPercent = parseNumber(personilMatch[4]);
      data.personilTtCount = parseNumber(personilMatch[5]);
    }

    const rataSatkerMatch = normalized.match(
      /Rata-rata satker:\s*IG\s*([\d.,]+)%\s*\(median\s*([\d.,]+)%\),\s*TT\s*([\d.,]+)%\s*\(median\s*([\d.,]+)%\)/i
    );
    if (rataSatkerMatch) {
      data.avgIg = parseNumber(rataSatkerMatch[1]);
      data.medianIg = parseNumber(rataSatkerMatch[2]);
      data.avgTt = parseNumber(rataSatkerMatch[3]);
      data.medianTt = parseNumber(rataSatkerMatch[4]);
    }

    const bestSatkerMatch = normalized.match(
      /Satker dengan capaian ≥90% IG & TT:\s*([^\n.]+)[^\n]*/i
    );
    if (bestSatkerMatch) data.bestSatkers = bestSatkerMatch[1].trim();

    const strongSatkerMatch = normalized.match(
      /Satker di kisaran 80% \(butuh dorongan akhir\):\s*([^\n.]+)[^\n]*/i
    );
    if (strongSatkerMatch) data.strongSatkers = strongSatkerMatch[1].trim();

    const lowSatkerMatch = normalized.match(
      /Satker perlu perhatian \(<10% di kedua kanal\):\s*([^\n.]+)[^\n]*/i
    );
    if (lowSatkerMatch) data.lowSatkers = lowSatkerMatch[1].trim();

    const gapLinesMatch = normalized.match(
      /Gap IG vs TikTok \(≥10 poin[^\n]*\):\s*([\s\S]*?)(?:\n#|\nDemikian|$)/i
    );
    if (gapLinesMatch) {
      data.gapLines = gapLinesMatch[1]
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    }

    const igBacklogMatch = normalized.match(
      /IG belum diisi:\s*([\d.,]+)\s+akun[^≈]*≈([\d.,]+)%: ([^\n)]+)/i
    );
    if (igBacklogMatch) {
      data.igBacklog = parseNumber(igBacklogMatch[1]);
      data.igBacklogTopPercent = parseNumber(igBacklogMatch[2]);
      data.igBacklogTopList = igBacklogMatch[3].trim();
    }

    const ttBacklogMatch = normalized.match(
      /TikTok belum diisi:\s*([\d.,]+)\s+akun[^≈]*≈([\d.,]+)%: ([^\n)]+)/i
    );
    if (ttBacklogMatch) {
      data.ttBacklog = parseNumber(ttBacklogMatch[1]);
      data.ttBacklogTopPercent = parseNumber(ttBacklogMatch[2]);
      data.ttBacklogTopList = ttBacklogMatch[3].trim();
    }

    const projectionMatch = normalized.match(
      /Proyeksi jika 70% Top-10 teratasi:\s*IG\s*→\s*~([\d.,]+)%[,\s]+TT\s*→\s*~([\d.,]+)%/i
    );
    if (projectionMatch) {
      data.projectedIg = parseNumber(projectionMatch[1]);
      data.projectedTt = parseNumber(projectionMatch[2]);
    }

    const topPerfMatch = normalized.match(
      /Top performer rata-rata IG\/TT:\s*([^\n.]+)[^\n]*/i
    );
    if (topPerfMatch) data.topPerformers = topPerfMatch[1].trim();

    const bottomPerfMatch = normalized.match(
      /Bottom performer rata-rata IG\/TT:\s*([^\n.]+)[^\n]*/i
    );
    if (bottomPerfMatch) data.bottomPerformers = bottomPerfMatch[1].trim();

    const notesMatch = normalized.match(/# Catatan Tambahan\s*([\s\S]*?)(?:\nDemikian|$)/i);
    if (notesMatch) {
      data.notes = notesMatch[1]
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ");
    }

    return data;
  };

  const extractTtData = (text) => {
    const normalized = normalizeText(text);
    const data = {};

    const contentMatch = normalized.match(/Konten dipantau\s*:\s*([\d.,]+)/i);
    if (contentMatch) data.contentCount = parseNumber(contentMatch[1]);

    const interactionMatch = normalized.match(
      /Interaksi aktual\s*:\s*([\d.,]+)\/([\d.,]+)\s*\(([\d.,]+)%/i
    );
    if (interactionMatch) {
      data.totalComments = parseNumber(interactionMatch[1]);
      data.targetComments = parseNumber(interactionMatch[2]);
      data.commentPercent = parseNumber(interactionMatch[3]);
    }

    const hitTargetMatch = normalized.match(
      /Personel mencapai target\s*:\s*([\d.,]+)\/([\d.,]+)\s*\(([\d.,]+)%/i
    );
    if (hitTargetMatch) {
      data.hitTarget = parseNumber(hitTargetMatch[1]);
      data.eligible = parseNumber(hitTargetMatch[2]);
      data.participationPercent = parseNumber(hitTargetMatch[3]);
    }

    const activeMatch = normalized.match(
      /Personel aktif \(≥1 konten\)\s*:\s*([\d.,]+)\/([\d.,]+)\s*\(([\d.,]+)%/i
    );
    if (activeMatch) {
      data.activeCount = parseNumber(activeMatch[1]);
      data.activeEligible = parseNumber(activeMatch[2]);
      data.activationPercent = parseNumber(activeMatch[3]);
    }

    const uniqueMatch = normalized.match(/Partisipan unik\s*:\s*([\d.,]+)/i);
    if (uniqueMatch) data.uniqueParticipants = parseNumber(uniqueMatch[1]);

    const bestContentMatch = normalized.match(
      /Performa tertinggi\s*:\s*([^\n]+)/i
    );
    if (bestContentMatch) data.bestContent = bestContentMatch[1].trim();

    const worstContentMatch = normalized.match(
      /Performa terendah\s*:\s*([^\n]+)/i
    );
    if (worstContentMatch) data.worstContent = worstContentMatch[1].trim();

    const topContribMatch = normalized.match(
      /Penyumbang komentar terbesar\s*:\s*([^\n]+)/i
    );
    if (topContribMatch) data.topContributor = topContribMatch[1].trim();

    const topSatkerMatch = normalized.match(
      /Top satker aktif\s*:\s*([^\n]+)/i
    );
    if (topSatkerMatch) data.topSatkers = topSatkerMatch[1].trim();

    const lowSatkerMatch = normalized.match(
      /Satker perlu perhatian\s*:\s*([^\n]+)/i
    );
    if (lowSatkerMatch) data.lowSatkers = lowSatkerMatch[1].trim();

    const backlogMatch = normalized.match(
      /Personel belum komentar\s*:\s*([\d.,]+)\s*\(prioritas:\s*([^\n]+)\)/i
    );
    if (backlogMatch) {
      data.backlog = parseNumber(backlogMatch[1]);
      data.backlogFocus = backlogMatch[2].trim();
    }

    const missingHandleMatch = normalized.match(
      /Belum input akun TikTok\s*:\s*([\d.,]+)\s*\(sumber utama:\s*([^\n]+)\)/i
    );
    if (missingHandleMatch) {
      data.missingHandle = parseNumber(missingHandleMatch[1]);
      data.missingHandleFocus = missingHandleMatch[2].trim();
    }

    const failureMatch = normalized.match(/⚠️ Data komentar gagal diambil[^\n]*/i);
    if (failureMatch) data.failureNote = failureMatch[0];

    return data;
  };

  const ig = extractIgData(igNarrative);
  const tt = extractTtData(ttNarrative);

  const header = `*Laporan Harian Engagement – ${hari}, ${tanggal}*`;

  const likeRatio = formatRatio(ig.totalLikes, ig.totalLikesTarget, ig.likePercent);
  const igTargetText = (() => {
    if (ig.targetLikes == null) return null;
    if (ig.likeGap != null && ig.likeGap > 0)
      return `Selisih ${formatInteger(
        ig.likeGap
      )} dari target ${formatInteger(
        ig.targetLikes
      )} likes membuka ruang kolaborasi lembut untuk mengejar momentum hari ini.`;
    return `Target ${formatInteger(
      ig.targetLikes
    )} likes sudah tercapai; pola sukses ini bisa menjadi contoh hangat bagi satker lain.`;
  })();
  const igContributorSentence = ig.topContributor
    ? `Kontribusi utama mengalir dari ${stripTrailingPunctuation(
        ig.topContributor
      )}, menghadirkan energi positif bagi jajaran DITBINMAS.`
    : null;
  const igContentSentence = ig.topContentLine
    ? `Konten unggulan ${cleanContentLine(
        ig.topContentLine
      )} memancing percakapan hangat dan menjadi jangkar perhatian publik.`
    : null;
  const igGapSentence = ig.contentGapLine
    ? `Sebaran masih timpang—${ig.contentGapLine}—kita dapat menata ulang ritme distribusi agar setiap cerita ikut bersinar.`
    : null;

  const igParagraphs = [];
  igParagraphs.push(
    combineSentences([
      ig.contentCount != null
        ? `Cicero memotret ${formatInteger(
            ig.contentCount
          )} konten aktif yang meramaikan etalase pembinaan masyarakat hari ini.`
        : null,
      likeRatio
        ? `Respon warganet tercermin pada ${likeRatio}, menguatkan narasi pendampingan yang dibawa DITBINMAS.`
        : null,
      igTargetText,
    ])
  );
  igParagraphs.push(combineSentences([igContributorSentence, igContentSentence, igGapSentence]));

  const commentRatio = formatRatio(
    tt.totalComments,
    tt.targetComments,
    tt.commentPercent
  );
  const participantRatio = formatRatio(
    tt.hitTarget,
    tt.eligible,
    tt.participationPercent
  );
  const activationRatio = formatRatio(
    tt.activeCount,
    tt.activeEligible,
    tt.activationPercent
  );

  const ttBacklogSentence =
    tt.backlog != null
      ? `Masih ada ${formatInteger(
          tt.backlog
        )} komentar yang menunggu respon (${tt.backlogFocus}); sentuhan ringan tiap hari akan mempercepat penutupan.`
      : null;
  const ttMissingSentence =
    tt.missingHandle != null
      ? `Sebanyak ${formatInteger(
          tt.missingHandle
        )} akun belum ter-input (${tt.missingHandleFocus}); melengkapinya akan memperkuat jangkauan komunitas.`
      : null;
  const ttContributorSentence = (() => {
    if (tt.topContributor && tt.topSatkers)
      return `Energi komunitas dipimpin oleh ${tt.topContributor}, disambut ${tt.topSatkers} yang menjaga irama komentar.`;
    if (tt.topContributor)
      return `Energi komunitas dipimpin oleh ${tt.topContributor}.`;
    if (tt.topSatkers)
      return `Gelombang interaksi dijaga oleh ${tt.topSatkers}.`;
    return null;
  })();

  const ttParagraphs = [];
  ttParagraphs.push(
    combineSentences([
      tt.contentCount != null
        ? `Di ruang TikTok, Cicero merekam ${formatInteger(
            tt.contentCount
          )} konten yang membuat lini masa DITBINMAS tetap hidup.`
        : null,
      commentRatio
        ? `Gelombang interaksi ${commentRatio} menggambarkan partisipasi yang terus bergerak.`
        : null,
      participantRatio
        ? `Sebaran personel yang mencapai target berada pada ${participantRatio}, menandakan kebiasaan positif mulai mengakar.`
        : null,
      activationRatio
        ? `Aktivasi harian tercatat ${activationRatio}, menegaskan komunitas semakin solid.`
        : null,
    ])
  );
  ttParagraphs.push(
    combineSentences([ttContributorSentence, ttBacklogSentence, ttMissingSentence])
  );
  if (tt.failureNote)
    ttParagraphs.push(
      combineSentences([
        `Catatan teknis: ${tt.failureNote}.`,
        "Tim analitik siap melakukan reset sensor jika diperlukan.",
      ])
    );

  const personilParagraphs = [];
  if (ig.personilTotal != null) {
    const channels = [];
    if (ig.personilIgPercent != null && ig.personilIgCount != null)
      channels.push(
        `Instagram ${formatPercent(ig.personilIgPercent)}% (${formatInteger(
          ig.personilIgCount
        )})`
      );
    if (ig.personilTtPercent != null && ig.personilTtCount != null)
      channels.push(
        `TikTok ${formatPercent(ig.personilTtPercent)}% (${formatInteger(
          ig.personilTtCount
        )})`
      );
    personilParagraphs.push(
      combineSentences([
        `Jejaring personel DITBINMAS tercatat ${formatInteger(
          ig.personilTotal
        )} individu aktif, tersebar di ${channels.join(" dan ")} sebagai garda terdepan pembinaan masyarakat.`,
      ])
    );
  }

  if (ig.avgIg != null || ig.avgTt != null) {
    const avgSentences = [];
    if (ig.avgIg != null) {
      const medianText =
        ig.medianIg != null ? ` (median ${formatPercent(ig.medianIg)}%)` : "";
      avgSentences.push(
        `Rata-rata satker IG berada di ${formatPercent(ig.avgIg)}%${medianText}.`
      );
    }
    if (ig.avgTt != null) {
      const medianText =
        ig.medianTt != null ? ` (median ${formatPercent(ig.medianTt)}%)` : "";
      avgSentences.push(
        `Rata-rata satker TikTok mencapai ${formatPercent(ig.avgTt)}%${medianText}.`
      );
    }
    if (avgSentences.length)
      personilParagraphs.push(combineSentences(avgSentences));
  }

  const excellenceSentences = combineSentences([
    ig.bestSatkers
      ? `${ig.bestSatkers} memimpin papan atas dan layak dijadikan referensi praktik baik.`
      : null,
    ig.strongSatkers
      ? `${ig.strongSatkers} tinggal selangkah lagi menuju kategori unggul; dorongan positif akan sangat membantu.`
      : null,
    ig.lowSatkers
      ? `Area yang masih mencari ritme: ${ig.lowSatkers}; pendampingan ringan bisa mengangkat performanya.`
      : null,
  ]);
  if (excellenceSentences) personilParagraphs.push(excellenceSentences);

  const backlogParagraph = combineSentences([
    ig.igBacklog != null
      ? `Backlog Instagram tersisa ${formatInteger(ig.igBacklog)} akun (${ig.igBacklogTopPercent != null
          ? `Top-10 ≈ ${formatPercent(ig.igBacklogTopPercent)}%`
          : "Top-10"
        }: ${ig.igBacklogTopList || "-"}).`
      : null,
    ig.ttBacklog != null
      ? `Backlog TikTok berada di ${formatInteger(ig.ttBacklog)} akun (${ig.ttBacklogTopPercent != null
          ? `Top-10 ≈ ${formatPercent(ig.ttBacklogTopPercent)}%`
          : "Top-10"
        }: ${ig.ttBacklogTopList || "-"}).`
      : null,
    ig.projectedIg != null || ig.projectedTt != null
      ? `Jika backlog ini terurai, proyeksi capaian dapat menyentuh ${[
          ig.projectedIg != null
            ? `IG ~${formatPercent(ig.projectedIg)}%`
            : null,
          ig.projectedTt != null
            ? `TikTok ~${formatPercent(ig.projectedTt)}%`
            : null,
        ]
          .filter(Boolean)
          .join(", "
        )}.`
      : null,
  ]);
  if (backlogParagraph) personilParagraphs.push(backlogParagraph);

  const performanceNotes = combineSentences([
    ig.topPerformers
      ? `Top performer: ${ig.topPerformers}, memberikan suntikan semangat.`
      : null,
    ig.bottomPerformers
      ? `Area belajar: ${ig.bottomPerformers}, dapat menjadi fokus sesi coaching berikutnya.`
      : null,
    ig.notes ? `Catatan tambahan: ${ig.notes}.` : null,
  ]);
  if (performanceNotes) personilParagraphs.push(performanceNotes);

  const buildClosing = () => {
    const igBacklog = ig.igBacklog ?? 0;
    const ttBacklog = tt.backlog ?? 0;
    const igGood = ig.targetAchieved === true || (ig.likePercent ?? 0) >= 95;
    const ttGood = (tt.commentPercent ?? 0) >= 80;
    const backlogHigh = igBacklog > 30 || ttBacklog > 30;
    const backlogModerate = igBacklog > 10 || ttBacklog > 10;
    const likeGapHigh = (ig.likeGap ?? 0) > 0;

    if (igGood && ttGood && !backlogModerate)
      return "Capaian IG & TikTok sudah sesuai target; terima kasih atas sinergi hangat seluruh pembina di jajaran DITBINMAS.";
    if (backlogHigh)
      return "Backlog personel masih tinggi; dukungan ekstra dari para pembina untuk satker prioritas akan sangat berarti.";
    if (likeGapHigh || !ttGood)
      return "Target harian belum sepenuhnya terpenuhi; kolaborasi halus antar satker akan membantu menutup gap likes dan komentar.";
    return "Progres bergerak positif; mari terus kawal pengejaran target harian dengan ritme nyaman ala DITBINMAS.";
  };

  const sections = [];
  sections.push(
    ["1. 📸 *Instagram*", ...indentParagraphs(igParagraphs)].join("\n")
  );
  sections.push(
    ["2. 🎵 *TikTok*", ...indentParagraphs(ttParagraphs)].join("\n")
  );
  sections.push(
    ["3. 👥 *Data Personil*", ...indentParagraphs(personilParagraphs)].join("\n")
  );

  const closingLine = buildClosing();

  return [header, "", "*DIREKTORAT BINMAS*", "", ...sections, "", closingLine]
    .filter((segment) => typeof segment === "string" && segment.trim() !== "")
    .join("\n")
    .trim();
}

async function performAction(
  action,
  clientId,
  waClient,
  chatId,
  roleFlag,
  userClientId,
  context = {}
) {
  let msg = "";
  const userClient = userClientId ? await findClientById(userClientId) : null;
  const userType = userClient?.client_type?.toLowerCase();
  switch (action) {
    case "1": {
      msg = await formatRekapUserData(clientId, roleFlag);
      break;
    }
    case "2": {
      msg = await formatExecutiveSummary(clientId, roleFlag);
      break;
    }
    case "3":
      msg = await formatRekapBelumLengkapDitbinmas();
      break;
    case "4": {
      try {
        const { filePath } = await saveSatkerUpdateMatrixExcel({
          clientId,
          roleFlag,
          username: context.username,
        });
        const buffer = await readFile(filePath);
        await sendWAFile(
          waClient,
          buffer,
          basename(filePath),
          chatId,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        await unlink(filePath);
        msg = "✅ File Excel dikirim.";
      } catch (error) {
        console.error("Gagal membuat rekap matriks update satker:", error);
        msg =
          error?.message &&
          (error.message.includes("direktorat") ||
            error.message.includes("Client tidak ditemukan"))
            ? error.message
            : "❌ Gagal membuat rekap matriks update satker.";
      }
      break;
    }
    case "5":
      msg = await absensiLikesDitbinmas();
      break;
    case "6":
      msg = await absensiLikesDitbinmasSimple();
      break;
    case "7": {
      const normalizedId = (clientId || "").toUpperCase();
      if (normalizedId !== "DITBINMAS") {
        msg = "Menu ini hanya tersedia untuk client DITBINMAS.";
        break;
      }
      const opts = { mode: "all", roleFlag: "ditbinmas" };
      msg = await absensiLikes("DITBINMAS", opts);
      break;
    }
    case "8":
      msg = await absensiKomentarTiktok();
      break;
    case "9":
      msg = await absensiKomentarDitbinmasSimple();
      break;
    case "10":
      msg = await absensiKomentarDitbinmas();
      break;
    case "11": {
      msg = await absensiRegistrasiDashboardDitbinmas();
      break;
    }
    case "12": {
      const { fetchAndStoreInstaContent } = await import("../fetchpost/instaFetchPost.js");
      const { handleFetchLikesInstagram } = await import("../fetchengagement/fetchLikesInstagram.js");
      const { rekapLikesIG } = await import("../fetchabsensi/insta/absensiLikesInsta.js");
      await fetchAndStoreInstaContent([
        "shortcode",
        "caption",
        "like_count",
        "timestamp",
      ], waClient, chatId, "DITBINMAS");
      await handleFetchLikesInstagram(null, null, "DITBINMAS");
      const rekapMsg = await rekapLikesIG("DITBINMAS");
      msg =
        rekapMsg ||
        "Belum ada konten IG pada akun Official DIREKTORAT BINMAS hari ini";
      break;
    }
    case "13": {
      const { handleFetchLikesInstagram } = await import("../fetchengagement/fetchLikesInstagram.js");
      await handleFetchLikesInstagram(waClient, chatId, "DITBINMAS");
      msg = "✅ Selesai fetch likes Instagram DITBINMAS.";
      break;
    }
    case "14": {
      const normalizedId = (clientId || "").toUpperCase();
      if (normalizedId !== "DITBINMAS") {
        msg = "Menu ini hanya tersedia untuk client DITBINMAS.";
        break;
      }
      const { fetchAndStoreTiktokContent } = await import("../fetchpost/tiktokFetchPost.js");
      const { handleFetchKomentarTiktokBatch } = await import("../fetchengagement/fetchCommentTiktok.js");
      await fetchAndStoreTiktokContent("DITBINMAS", waClient, chatId);
      await handleFetchKomentarTiktokBatch(waClient, chatId, "DITBINMAS");
      const rekapTiktok = await absensiKomentarDitbinmasReport(
        userType === "org" ? { clientFilter: userClientId } : {}
      );
      msg =
        rekapTiktok ||
        "Tidak ada konten TikTok untuk DIREKTORAT BINMAS hari ini.";
      break;
    }
    case "15": {
      const { handleFetchKomentarTiktokBatch } = await import("../fetchengagement/fetchCommentTiktok.js");
      await handleFetchKomentarTiktokBatch(waClient, chatId, "DITBINMAS");
      msg = "✅ Selesai fetch komentar TikTok DITBINMAS.";
      break;
    }
    case "16": {
      const { fetchAndStoreInstaContent } = await import("../fetchpost/instaFetchPost.js");
      const { handleFetchLikesInstagram } = await import("../fetchengagement/fetchLikesInstagram.js");
      const { fetchAndStoreTiktokContent } = await import("../fetchpost/tiktokFetchPost.js");
      const { handleFetchKomentarTiktokBatch } = await import("../fetchengagement/fetchCommentTiktok.js");
      const { generateSosmedTaskMessage } = await import("../fetchabsensi/sosmedTask.js");

      const targetId = (clientId || "").toUpperCase();
      const fetchErrors = [];

      let previousIgShortcodes = [];
      let previousTiktokVideoIds = [];
      try {
        previousIgShortcodes = await getShortcodesTodayByClient(targetId);
      } catch (err) {
        console.error("Error reading previous Instagram shortcodes:", err);
        previousIgShortcodes = [];
      }
      try {
        previousTiktokVideoIds = await getVideoIdsTodayByClient(targetId);
      } catch (err) {
        console.error("Error reading previous TikTok video IDs:", err);
        previousTiktokVideoIds = [];
      }

      try {
        await fetchAndStoreInstaContent(
          ["shortcode", "caption", "like_count", "timestamp"],
          waClient,
          chatId,
          targetId
        );
      } catch (err) {
        console.error("Error fetching Instagram content:", err);
        fetchErrors.push("Instagram content");
      }
      try {
        await handleFetchLikesInstagram(null, null, targetId);
      } catch (err) {
        console.error("Error fetching Instagram likes:", err);
        fetchErrors.push("Instagram likes");
      }
      try {
        await fetchAndStoreTiktokContent(targetId, waClient, chatId);
      } catch (err) {
        console.error("Error fetching TikTok content:", err);
        fetchErrors.push("TikTok content");
      }
      try {
        await handleFetchKomentarTiktokBatch(null, null, targetId);
      } catch (err) {
        console.error("Error fetching TikTok comments:", err);
        fetchErrors.push("TikTok comments");
      }
      const previousState = {
        igShortcodes: Array.isArray(previousIgShortcodes)
          ? previousIgShortcodes
          : [],
        tiktokVideoIds: Array.isArray(previousTiktokVideoIds)
          ? previousTiktokVideoIds
          : [],
      };
      try {
        ({ text: msg } = await generateSosmedTaskMessage(targetId, {
          skipTiktokFetch: true,
          skipLikesFetch: true,
          previousState,
        }));
      } catch (err) {
        console.error("Error generating sosmed task message:", err);
        msg = "Gagal membuat pesan tugas.";
        fetchErrors.push("task message");
      }
      if (fetchErrors.length) {
        msg = `${msg}\n\n⚠️ Sebagian data gagal diambil.`.trim();
      }
      break;
    }
    case "17": {
        const { text, filename, narrative, textBelum, filenameBelum } = await lapharDitbinmas();
        const dirPath = "laphar";
        await mkdir(dirPath, { recursive: true });
        if (narrative) {
          await waClient.sendMessage(chatId, narrative.trim());
        }
        if (text && filename) {
          const buffer = Buffer.from(text, "utf-8");
          const filePath = join(dirPath, filename);
          await writeFile(filePath, buffer);
          await sendWAFile(waClient, buffer, filename, chatId, "text/plain");
        }
        if (textBelum && filenameBelum) {
          const bufferBelum = Buffer.from(textBelum, "utf-8");
          const filePathBelum = join(dirPath, filenameBelum);
          await writeFile(filePathBelum, bufferBelum);
          await sendWAFile(waClient, bufferBelum, filenameBelum, chatId, "text/plain");
        }
        const recapData = await collectLikesRecap(clientId);
        if (recapData.shortcodes.length) {
          const excelPath = await saveLikesRecapExcel(recapData, clientId);
          const bufferExcel = await readFile(excelPath);
          await sendWAFile(waClient, bufferExcel, basename(excelPath), chatId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          await unlink(excelPath);
        }
        return;
      }
      case "18": {
        const { text, filename, narrative, textBelum, filenameBelum } = await lapharTiktokDitbinmas();
        const dirPath = "laphar";
        await mkdir(dirPath, { recursive: true });
        if (narrative) {
          await waClient.sendMessage(chatId, narrative.trim());
        }
        if (text && filename) {
          const buffer = Buffer.from(text, "utf-8");
          const filePath = join(dirPath, filename);
          await writeFile(filePath, buffer);
          await sendWAFile(waClient, buffer, filename, chatId, "text/plain");
        }
        if (textBelum && filenameBelum) {
          const bufferBelum = Buffer.from(textBelum, "utf-8");
          const filePathBelum = join(dirPath, filenameBelum);
          await writeFile(filePathBelum, bufferBelum);
          await sendWAFile(waClient, bufferBelum, filenameBelum, chatId, "text/plain");
        }
        const recapData = await collectKomentarRecap(clientId);
        if (recapData.videoIds.length) {
          const excelPath = await saveCommentRecapExcel(recapData, clientId);
          const bufferExcel = await readFile(excelPath);
          await sendWAFile(waClient, bufferExcel, basename(excelPath), chatId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          await unlink(excelPath);
        }
        return;
      }
      case "19": {
        const data = await collectLikesRecap(clientId);
        if (typeof data === "string") {
          msg = data;
          break;
        }
        if (!data.shortcodes.length) {
          msg = `Tidak ada konten IG untuk *${clientId}* hari ini.`;
          break;
        }
        const filePath = await saveLikesRecapExcel(data, clientId);
        const buffer = await readFile(filePath);
        await sendWAFile(waClient, buffer, basename(filePath), chatId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        await unlink(filePath);
        msg = "✅ File Excel dikirim.";
        break;
      }
      case "20": {
        const recapData = await collectKomentarRecap(clientId);
        if (!recapData?.videoIds?.length) {
          msg = `Tidak ada konten TikTok untuk *${clientId}* hari ini.`;
          break;
        }
        const filePath = await saveCommentRecapExcel(recapData, clientId);

        const buffer = await readFile(filePath);
        await sendWAFile(
          waClient,
          buffer,
          basename(filePath),
          chatId,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        await unlink(filePath);
        msg = "✅ File Excel dikirim.";
        break;
      }
      case "21": {
        const dirPath = "laphar";
        await mkdir(dirPath, { recursive: true });
        const [ig, tt] = await Promise.all([lapharDitbinmas(), lapharTiktokDitbinmas()]);
        const narrative = formatRekapAllSosmed(ig.narrative, tt.narrative);
        if (narrative) {
          await waClient.sendMessage(chatId, narrative);
        }
        if (ig.text && ig.filename) {
          const buffer = Buffer.from(ig.text, "utf-8");
          const filePath = join(dirPath, ig.filename);
          await writeFile(filePath, buffer);
          await sendWAFile(waClient, buffer, ig.filename, chatId, "text/plain");
        }
        const igRecap = await collectLikesRecap(clientId);
        if (igRecap.shortcodes.length) {
          const excelPath = await saveLikesRecapExcel(igRecap, clientId);
          const bufferExcel = await readFile(excelPath);
          await sendWAFile(waClient, bufferExcel, basename(excelPath), chatId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          await unlink(excelPath);
        }
        if (tt.text && tt.filename) {
          const buffer = Buffer.from(tt.text, "utf-8");
          const filePath = join(dirPath, tt.filename);
          await writeFile(filePath, buffer);
          await sendWAFile(waClient, buffer, tt.filename, chatId, "text/plain");
        }
        const ttRecap = await collectKomentarRecap(clientId);
        if (ttRecap.videoIds.length) {
          const excelPath = await saveCommentRecapExcel(ttRecap, clientId);
          const bufferExcel = await readFile(excelPath);
          await sendWAFile(waClient, bufferExcel, basename(excelPath), chatId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          await unlink(excelPath);
        }
        return;
      }
      case "23": {
        let filePath;
        try {
          filePath = await saveWeeklyLikesRecapExcel(clientId);
          if (!filePath) {
            msg = "Tidak ada data.";
            break;
          }
          const buffer = await readFile(filePath);
          await sendWAFile(waClient, buffer, basename(filePath), chatId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          msg = "✅ File Excel dikirim.";
        } catch (error) {
          console.error("Gagal mengirim file Excel:", error);
          msg = "❌ Gagal mengirim file Excel.";
        } finally {
          if (filePath) {
            try {
              await unlink(filePath);
            } catch (err) {
              console.error("Gagal menghapus file sementara:", err);
            }
          }
        }
        break;
      }
      case "24": {
        let filePath;
        try {
          filePath = await saveWeeklyCommentRecapExcel(clientId);
          if (!filePath) {
            msg = "Tidak ada data.";
            break;
          }
          const buffer = await readFile(filePath);
          await sendWAFile(waClient, buffer, basename(filePath), chatId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          msg = "✅ File Excel dikirim.";
        } catch (error) {
          console.error("Gagal mengirim file Excel:", error);
          msg = "❌ Gagal mengirim file Excel.";
        } finally {
          if (filePath) {
            try {
              await unlink(filePath);
            } catch (err) {
              console.error("Gagal menghapus file sementara:", err);
            }
          }
        }
        break;
      }
      case "25": {
        try {
          msg = await generateWeeklyTiktokHighLowReport(clientId, { roleFlag });
        } catch (error) {
          console.error("Gagal membuat laporan TikTok Top and Bottom:", error);
          msg =
            error?.message &&
            (error.message.includes("data") ||
              error.message.includes("clientId"))
              ? error.message
              : "❌ Gagal membuat laporan TikTok Top and Bottom.";
        }
        break;
      }
      case "26": {
        if (!isDitbinmas(clientId) || !isDitbinmas(roleFlag)) {
          msg =
            "Menu Instagram Top and Bottom hanya tersedia untuk pengguna DITBINMAS.";
          break;
        }
        try {
          msg = await generateWeeklyInstagramHighLowReport(clientId, { roleFlag });
        } catch (error) {
          console.error("Gagal membuat laporan Instagram Top and Bottom:", error);
          msg =
            error?.message &&
            (error.message.includes("data") ||
              error.message.includes("clientId") ||
              error.message.includes("DITBINMAS"))
              ? error.message
              : "❌ Gagal membuat laporan Instagram Top and Bottom.";
        }
        break;
      }
      case "27": {
        let filePath;
        try {
          filePath = await saveMonthlyLikesRecapExcel(clientId);
          if (!filePath) {
            msg = "Tidak ada data.";
            break;
          }
          const buffer = await readFile(filePath);
          await sendWAFile(waClient, buffer, basename(filePath), chatId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          msg = "✅ File Excel dikirim.";
        } catch (error) {
          console.error("Gagal mengirim file Excel:", error);
          msg = "❌ Gagal mengirim file Excel.";
        } finally {
          if (filePath) {
            try {
              await unlink(filePath);
            } catch (err) {
              console.error("Gagal menghapus file sementara:", err);
            }
          }
        }
        break;
      }
      case "28": {
        const data = await collectLikesRecap(clientId);
        if (typeof data === "string") {
          msg = data;
          break;
        }
        if (!data.shortcodes.length) {
          msg = `Tidak ada konten IG untuk *${clientId}* hari ini.`;
          break;
        }
        const filePath = await saveLikesRecapPerContentExcel(data, clientId);
        const buffer = await readFile(filePath);
        await sendWAFile(
          waClient,
          buffer,
          basename(filePath),
          chatId,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        await unlink(filePath);
        msg = "✅ File Excel dikirim.";
        break;
      }
    case "29": {
      const recapData = await collectKomentarRecap(clientId);
      if (!recapData?.videoIds?.length) {
        msg = `Tidak ada konten TikTok untuk *${clientId}* hari ini.`;
        break;
      }
      const filePath = await saveCommentRecapPerContentExcel(recapData, clientId);
      const buffer = await readFile(filePath);
      await sendWAFile(
        waClient,
        buffer,
        basename(filePath),
        chatId,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      await unlink(filePath);
      msg = "✅ File Excel dikirim.";
      break;
    }
    case "31": {
      try {
        msg = await formatTopPersonnelRanking(clientId, roleFlag);
      } catch (error) {
        console.error(
          "Gagal membuat ranking like/komentar personel:",
          error
        );
        msg = "❌ Gagal membuat ranking like/komentar personel.";
      }
      break;
    }
    case "32": {
      try {
        msg = await formatTopPolresRanking(clientId, roleFlag);
      } catch (error) {
        console.error(
          "Gagal membuat ranking like/komentar polres:",
          error
        );
        msg = "❌ Gagal membuat ranking like/komentar polres.";
      }
      break;
    }
    default:
      msg = "Menu tidak dikenal.";
  }
  await waClient.sendMessage(chatId, msg.trim());
  if (action === "12" || action === "14" || action === "16") {
      await safeSendMessage(waClient, dirRequestGroup, msg.trim());
    }
  }

export const dirRequestHandlers = {
  async choose_dash_user(session, chatId, _text, waClient) {
    const dashUsers = session.dash_users || [];
    const chosen = dashUsers[0];
    if (!chosen) {
      await waClient.sendMessage(
        chatId,
        "❌ Data dashboard user tidak ditemukan untuk akses dirrequest."
      );
      return;
    }
    session.role = chosen.role;
    session.client_ids = [DITBINMAS_CLIENT_ID];
    session.dir_client_id = DITBINMAS_CLIENT_ID;
    session.username = chosen.username || session.username;
    session.selectedClientId = DITBINMAS_CLIENT_ID;
    try {
      const ditClient = await findClientById(DITBINMAS_CLIENT_ID);
      session.clientName = ditClient?.nama || DITBINMAS_CLIENT_ID;
    } catch {
      session.clientName = DITBINMAS_CLIENT_ID;
    }
    delete session.dash_users;
    session.step = "main";
    await dirRequestHandlers.main(session, chatId, "", waClient);
  },

  async main(session, chatId, _text, waClient) {
    session.client_ids = [DITBINMAS_CLIENT_ID];
    if ((session.selectedClientId || "").toUpperCase() !== DITBINMAS_CLIENT_ID) {
      session.selectedClientId = DITBINMAS_CLIENT_ID;
    }
    if (!session.dir_client_id) {
      session.dir_client_id = DITBINMAS_CLIENT_ID;
    }
    if (!session.clientName || session.selectedClientId !== DITBINMAS_CLIENT_ID) {
      try {
        const client = await findClientById(DITBINMAS_CLIENT_ID);
        session.clientName = client?.nama || DITBINMAS_CLIENT_ID;
      } catch {
        session.clientName = DITBINMAS_CLIENT_ID;
      }
    }

    const clientName = session.clientName;
    const menu =
      `Client: *${clientName}*\n` +
      "┏━━━━━━━━━━━━ *MENU DIRREQUEST* ━━━━━━━━━━━━\n" +
        "📊 *Rekap Data*\n" +
        "1️⃣ Rekap personel belum lengkapi data\n" +
        "2️⃣ Ringkasan pengisian data personel\n" +
        "3️⃣ Rekap data belum lengkap Ditbinmas\n" +
        "4️⃣ Rekap Matriks Update Satker\n\n" +
        "📅 *Absensi*\n" +
        "5️⃣ Absensi like Ditbinmas\n" +
        "6️⃣ Absensi like Ditbinmas Simple\n" +
        "7️⃣ Absensi like Instagram\n" +
        "8️⃣ Absensi komentar TikTok\n" +
        "9️⃣ Absensi komentar Ditbinmas Simple\n" +
        "1️⃣0️⃣ Absensi komentar Ditbinmas\n" +
        "1️⃣1️⃣ Absensi user web dashboard Ditbinmas\n\n" +
        "📥 *Pengambilan Data*\n" +
        "1️⃣2️⃣ Ambil konten & like Instagram\n" +
        "1️⃣3️⃣ Ambil like Instagram saja\n" +
        "1️⃣4️⃣ Ambil konten & komentar TikTok\n" +
        "1️⃣5️⃣ Ambil komentar TikTok saja\n" +
        "1️⃣6️⃣ Ambil semua sosmed & buat tugas\n\n" +
        "📝 *Laporan*\n" +
        "1️⃣7️⃣ Laporan harian Instagram Ditbinmas\n" +
        "1️⃣8️⃣ Laporan harian TikTok Ditbinmas\n" +
        "1️⃣9️⃣ Rekap like Instagram (Excel)\n" +
        "2️⃣0️⃣ Rekap komentar TikTok (Excel)\n" +
        "2️⃣1️⃣ Rekap gabungan semua sosmed\n" +
        "2️⃣2️⃣ Rekap ranking engagement jajaran\n\n" +
        "📆 *Laporan Mingguan*\n" +
        "2️⃣3️⃣ Rekap file Instagram mingguan\n" +
        "2️⃣4️⃣ Rekap file Tiktok mingguan\n" +
        "2️⃣5️⃣ TikTok Top and Bottom (Top 5 & Bottom 5)\n" +
        "2️⃣6️⃣ Instagram Top and Bottom (Top 5 & Bottom 5)\n\n" +
        "🗓️ *Laporan Bulanan*\n" +
        "2️⃣7️⃣ Rekap file Instagram bulanan\n" +
        "2️⃣8️⃣ Rekap like Instagram per konten (Excel)\n" +
        "2️⃣9️⃣ Rekap komentar TikTok per konten (Excel)\n\n" +
        "🛡️ *Monitoring Kasatker*\n" +
        "3️⃣0️⃣ Laporan Kasatker\n" +
        "3️⃣1️⃣ Top ranking like/komentar personel\n" +
        "3️⃣2️⃣ Top ranking like/komentar polres tertinggi\n\n" +
        "┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n" +
        "Ketik *angka* menu atau *batal* untuk keluar.";
    await waClient.sendMessage(chatId, menu);
    session.step = "choose_menu";
  },

  async choose_client(session, chatId, text, waClient) {
    session.selectedClientId = DITBINMAS_CLIENT_ID;
    try {
      const client = await findClientById(DITBINMAS_CLIENT_ID);
      session.clientName = client?.nama || DITBINMAS_CLIENT_ID;
    } catch {
      session.clientName = DITBINMAS_CLIENT_ID;
    }
    await dirRequestHandlers.main(session, chatId, "", waClient);
  },

  async choose_menu(session, chatId, text, waClient) {
    const choice = text.trim();
    if (
        ![
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "10",
          "11",
          "12",
          "13",
          "14",
          "15",
          "16",
          "17",
          "18",
          "19",
          "20",
          "21",
          "22",
          "23",
          "24",
          "25",
          "26",
          "27",
          "28",
          "29",
          "30",
          "31",
          "32",
        ].includes(choice)
    ) {
      await waClient.sendMessage(chatId, "Pilihan tidak valid. Ketik angka menu.");
      return;
    }
    const userClientId = session.selectedClientId;
    if (!userClientId) {
      await waClient.sendMessage(chatId, "Client belum dipilih.");
      session.step = "main";
      await dirRequestHandlers.main(session, chatId, "", waClient);
      return;
    }
    const taskClientId = session.dir_client_id || userClientId;

    if (choice === "22") {
      session.step = "choose_engagement_recap_period";
      await waClient.sendMessage(chatId, ENGAGEMENT_RECAP_MENU_TEXT);
      return;
    }

    if (choice === "30") {
      session.step = "choose_kasatker_report_period";
      await waClient.sendMessage(chatId, KASATKER_REPORT_MENU_TEXT);
      return;
    }

    await performAction(
      choice,
      taskClientId,
      waClient,
      chatId,
      session.role,
      userClientId,
      { username: session.username || session.user?.username }
    );
    session.step = "main";
    await dirRequestHandlers.main(session, chatId, "", waClient);
  },

  async choose_engagement_recap_period(session, chatId, text, waClient) {
    const input = (text || "").trim();
    if (!input) {
      await waClient.sendMessage(chatId, ENGAGEMENT_RECAP_MENU_TEXT);
      return;
    }

    if (input.toLowerCase() === "batal") {
      await waClient.sendMessage(chatId, "✅ Menu rekap ranking engagement ditutup.");
      session.step = "main";
      await dirRequestHandlers.main(session, chatId, "", waClient);
      return;
    }

    const option = ENGAGEMENT_RECAP_PERIOD_MAP[input];
    if (!option) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka 1 sampai 6 atau ketik *batal*."
      );
      await waClient.sendMessage(chatId, ENGAGEMENT_RECAP_MENU_TEXT);
      return;
    }

    const targetClientId = session.dir_client_id || session.selectedClientId || DITBINMAS_CLIENT_ID;
    const roleFlag = session.role;
    let filePath;
    try {
      const { filePath: generatedPath } = await saveEngagementRankingExcel({
        clientId: targetClientId,
        roleFlag,
        period: option.period,
      });
      filePath = generatedPath;
      const buffer = await readFile(filePath);
      await sendWAFile(
        waClient,
        buffer,
        basename(filePath),
        chatId,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      await waClient.sendMessage(
        chatId,
        `✅ File Excel rekap ranking engagement (${option.label}) dikirim.`
      );
    } catch (error) {
      console.error("Gagal membuat rekap ranking engagement:", error);
      let msg;
      if (
        error?.message &&
        (error.message.includes("direktorat") ||
          error.message.includes("Client tidak ditemukan") ||
          error.message.includes("Tidak ada data"))
      ) {
        msg = error.message;
      } else {
        msg = `❌ Gagal membuat rekap ranking engagement (${option.label}).`;
      }
      await waClient.sendMessage(chatId, msg);
    } finally {
      if (filePath) {
        try {
          await unlink(filePath);
        } catch (err) {
          console.error("Gagal menghapus file sementara:", err);
        }
      }
    }

    session.step = "main";
    await dirRequestHandlers.main(session, chatId, "", waClient);
  },

  async choose_kasatker_report_period(session, chatId, text, waClient) {
    const input = (text || "").trim();
    if (!input) {
      await waClient.sendMessage(chatId, KASATKER_REPORT_MENU_TEXT);
      return;
    }

    if (input.toLowerCase() === "batal") {
      await waClient.sendMessage(chatId, "✅ Menu Laporan Kasatker ditutup.");
      session.step = "main";
      await dirRequestHandlers.main(session, chatId, "", waClient);
      return;
    }

    const option = KASATKER_REPORT_PERIOD_MAP[input];
    if (!option) {
      await waClient.sendMessage(
        chatId,
        "Pilihan tidak valid. Balas angka 1 sampai 4 atau ketik *batal*."
      );
      await waClient.sendMessage(chatId, KASATKER_REPORT_MENU_TEXT);
      return;
    }

    const targetClientId =
      session.dir_client_id || session.selectedClientId || DITBINMAS_CLIENT_ID;
    const roleFlag = session.role;

    try {
      const narrative = await generateKasatkerReport({
        clientId: targetClientId,
        roleFlag,
        period: option.period,
      });
      await waClient.sendMessage(chatId, narrative);
    } catch (error) {
      console.error("Gagal membuat Laporan Kasatker:", error);
      let msg;
      if (
        error?.message &&
        (error.message.includes("direktorat") ||
          error.message.includes("Client tidak ditemukan") ||
          error.message.includes("Tidak ada data"))
      ) {
        msg = error.message;
      } else {
        msg = `❌ Gagal membuat Laporan Kasatker (${option.label}).`;
      }
      await waClient.sendMessage(chatId, msg);
    }

    session.step = "main";
    await dirRequestHandlers.main(session, chatId, "", waClient);
  },
};

export {
  formatRekapUserData,
  formatTopPersonnelRanking,
  topPersonnelRankingDependencies,
  formatTopPolresRanking,
  topPolresRankingDependencies,
  absensiLikesDitbinmas,
  absensiLikesDitbinmasSimple,
  absensiKomentarDitbinmas,
  absensiKomentarDitbinmasSimple,
  absensiKomentarTiktok,
  formatExecutiveSummary,
  formatRekapBelumLengkapDitbinmas,
  formatRekapAllSosmed,
};

export default dirRequestHandlers;

