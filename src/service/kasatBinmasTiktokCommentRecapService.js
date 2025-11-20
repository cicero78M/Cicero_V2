import { getUsersByClient } from "../model/userModel.js";
import { getRekapKomentarByClient } from "../model/tiktokCommentModel.js";
import { formatNama } from "../utils/utilsHelper.js";
import { matchesKasatBinmasJabatan } from "./kasatkerAttendanceService.js";

const DITBINMAS_CLIENT_ID = "DITBINMAS";
const TARGET_ROLE = "ditbinmas";

const STATUS_SECTIONS = [
  { key: "lengkap", icon: "✅", label: "Lengkap (sesuai target)" },
  { key: "sebagian", icon: "🟡", label: "Sebagian (belum semua konten)" },
  { key: "belum", icon: "❌", label: "Belum komentar" },
  { key: "noUsername", icon: "⚠️❌", label: "Belum update akun TikTok" },
];

const PANGKAT_ORDER = [
  "KOMISARIS BESAR POLISI",
  "AKBP",
  "KOMPOL",
  "AKP",
  "IPTU",
  "IPDA",
  "AIPTU",
  "AIPDA",
  "BRIPKA",
  "BRIGPOL",
  "BRIGADIR",
  "BRIGADIR POLISI",
  "BRIPTU",
  "BRIPDA",
];

function rankWeight(rank) {
  const normalized = String(rank || "").toUpperCase();
  const idx = PANGKAT_ORDER.indexOf(normalized);
  return idx === -1 ? PANGKAT_ORDER.length : idx;
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLong(date) {
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDayLabel(date) {
  const weekday = date.toLocaleDateString("id-ID", { weekday: "long" });
  return `${weekday}, ${formatDateLong(date)}`;
}

function resolveWeeklyRange(baseDate = new Date()) {
  const date = new Date(baseDate.getTime());
  const day = date.getDay();
  const mondayDiff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date.getTime());
  monday.setDate(date.getDate() + mondayDiff);
  const sunday = new Date(monday.getTime());
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday,
    end: sunday,
    label: `${formatDayLabel(monday)} s.d. ${formatDayLabel(sunday)}`,
  };
}

function describePeriod(period = "daily") {
  const today = new Date();
  if (period === "weekly") {
    const { start, end, label } = resolveWeeklyRange(today);
    return {
      periode: "mingguan",
      label,
      tanggal: toDateInput(start),
      startDate: toDateInput(start),
      endDate: toDateInput(end),
    };
  }
  if (period === "monthly") {
    const label = today.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    return {
      periode: "bulanan",
      label: `Bulan ${label}`,
      tanggal: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
    };
  }
  return {
    periode: "harian",
    label: formatDayLabel(today),
    tanggal: toDateInput(today),
  };
}

function sortKasatEntries(entries) {
  return entries.slice().sort((a, b) => {
    const rankDiff = rankWeight(a.user?.title) - rankWeight(b.user?.title);
    if (rankDiff !== 0) return rankDiff;
    const nameA = formatNama(a.user) || "";
    const nameB = formatNama(b.user) || "";
    return nameA.localeCompare(nameB, "id-ID", { sensitivity: "base" });
  });
}

function formatEntryLine(entry, index, totalKonten) {
  const user = entry.user;
  const polres = (user?.client_name || user?.client_id || "-").toUpperCase();
  const name = formatNama(user) || "(Tanpa Nama)";
  if (!user?.tiktok) {
    return `${index}. ${name} (${polres}) — Username TikTok belum tersedia`;
  }
  if (totalKonten === 0) {
    return `${index}. ${name} (${polres}) — Tidak ada konten untuk dikomentari`;
  }
  if (entry.count >= totalKonten) {
    return `${index}. ${name} (${polres}) — Lengkap (${entry.count}/${totalKonten} konten)`;
  }
  if (entry.count > 0) {
    return `${index}. ${name} (${polres}) — ${entry.count}/${totalKonten} konten`;
  }
  return `${index}. ${name} (${polres}) — 0/${totalKonten} konten`;
}

export async function generateKasatBinmasTiktokCommentRecap({ period = "daily" } = {}) {
  const periodInfo = describePeriod(period);

  const users = await getUsersByClient(DITBINMAS_CLIENT_ID, TARGET_ROLE);
  const kasatUsers = (users || []).filter((user) => matchesKasatBinmasJabatan(user?.jabatan));

  if (!kasatUsers.length) {
    const totalUsers = users?.length || 0;
    return `Dari ${totalUsers} user aktif ${DITBINMAS_CLIENT_ID} (${TARGET_ROLE}), tidak ditemukan data Kasat Binmas.`;
  }

  const recapRows = await getRekapKomentarByClient(
    DITBINMAS_CLIENT_ID,
    periodInfo.periode,
    periodInfo.tanggal,
    periodInfo.startDate,
    periodInfo.endDate,
    TARGET_ROLE
  );

  const commentCountByUser = new Map();
  const totalKonten = Number(recapRows?.[0]?.total_konten ?? 0);
  (recapRows || []).forEach((row) => {
    if (!row) return;
    commentCountByUser.set(row.user_id, Number(row.jumlah_komentar) || 0);
  });

  const grouped = { lengkap: [], sebagian: [], belum: [], noUsername: [] };
  const totals = {
    total: kasatUsers.length,
    lengkap: 0,
    sebagian: 0,
    belum: 0,
    noUsername: 0,
  };

  kasatUsers.forEach((user) => {
    const count = commentCountByUser.get(user.user_id) || 0;
    let key = "belum";
    if (!user?.tiktok) {
      key = "noUsername";
    } else if (count >= totalKonten) {
      key = "lengkap";
    } else if (count > 0) {
      key = "sebagian";
    }

    totals[key] += 1;
    grouped[key].push({ user, count });
  });

  const sectionsText = STATUS_SECTIONS.map(({ key, icon, label }) => {
    const entries = sortKasatEntries(grouped[key] || []);
    const header = `${icon} *${label} (${entries.length} pers)*`;
    if (!entries.length) {
      return header;
    }
    const lines = entries.map(
      (entry, idx) => `   ${formatEntryLine(entry, idx + 1, totalKonten)}`
    );
    return [header, ...lines].join("\n");
  });

  const totalKontenLine =
    totalKonten > 0
      ? `Total konten periode: ${totalKonten} video`
      : "Total konten periode: 0 (tidak ada konten untuk dikomentari)";
  const noKontenNote =
    totalKonten === 0
      ? "Tidak ada konten yang perlu dikomentari pada periode ini. Status lengkap berarti tidak ada kewajiban komentar."
      : "";

  return [
    "📋 *Absensi Komentar TikTok Kasat Binmas*",
    `Periode: ${periodInfo.label}`,
    totalKontenLine,
    `Total Kasat Binmas: ${totals.total} pers`,
    `Lengkap: ${totals.lengkap}/${totals.total} pers`,
    `Sebagian: ${totals.sebagian}/${totals.total} pers`,
    `Belum komentar: ${totals.belum}/${totals.total} pers`,
    `Belum update akun TikTok: ${totals.noUsername} pers`,
    noKontenNote,
    "",
    ...sectionsText,
  ]
    .filter(Boolean)
    .join("\n");
}

export default { generateKasatBinmasTiktokCommentRecap };
