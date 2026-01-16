import { mkdir, readFile, unlink } from "fs/promises";
import path, { basename } from "path";
import XLSX from "xlsx";
import { getRekapLikesByClient } from "../model/instaLikeModel.js";
import { getUsersByClient } from "../model/userModel.js";
import { formatNama } from "../utils/utilsHelper.js";
import { sendWAFile, safeSendMessage } from "../utils/waHelper.js";
import { matchesKasatBinmasJabatan } from "./kasatkerAttendanceService.js";
import {
  describeKasatBinmasLikesPeriod,
  kasatBinmasRankWeight,
} from "./kasatBinmasLikesRecapService.js";

const DITBINMAS_CLIENT_ID = "DITBINMAS";
const TARGET_ROLE = "ditbinmas";
const EXPORT_DIR = path.resolve("export_data/dirrequest");
const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function sanitizeLabel(label) {
  return String(label || "").replace(/\s+/g, "_").replace(/[^\w\-]+/g, "-");
}

function buildFilename(periodLabel) {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/T/, "_")
    .slice(0, 19);
  const safeLabel = sanitizeLabel(periodLabel);
  return `Rekap_Likes_Kasat_Binmas_${safeLabel}_${stamp}.xlsx`;
}

function sortByLikes(entries) {
  return entries.slice().sort((a, b) => {
    const likeDiff = (b.totalLikes || 0) - (a.totalLikes || 0);
    if (likeDiff !== 0) return likeDiff;
    const rankDiff = kasatBinmasRankWeight(a.title) - kasatBinmasRankWeight(b.title);
    if (rankDiff !== 0) return rankDiff;
    const nameA = a.displayName || "";
    const nameB = b.displayName || "";
    return nameA.localeCompare(nameB, "id-ID", { sensitivity: "base" });
  });
}

function buildWorksheetRows(entries, periodLabel) {
  const header = ["Polres", "Pangkat dan Nama", "Total Likes"];
  const sorted = sortByLikes(entries);
  const dataRows = sorted.map((entry) => [
    entry.polres,
    entry.displayName,
    entry.totalLikes,
  ]);

  const aoa = [
    ["Rekap Likes Instagram Kasat Binmas (Excel)"],
    [`Periode: ${periodLabel}`],
    [],
    header,
    ...dataRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = header.map((_, idx) => {
    const colValues = dataRows.map((row) => String(row[idx] ?? ""));
    const maxLength = Math.max(colValues.reduce((m, v) => Math.max(m, v.length), 0), header[idx].length);
    return { wch: maxLength + 2 };
  });

  return ws;
}

export async function generateKasatBinmasLikesRecapExcel({ period = "daily" } = {}) {
  const periodInfo = describeKasatBinmasLikesPeriod(period);
  const users = await getUsersByClient(DITBINMAS_CLIENT_ID, TARGET_ROLE);
  const kasatUsers = (users || []).filter((user) => matchesKasatBinmasJabatan(user?.jabatan));

  if (!kasatUsers.length) {
    const totalUsers = users?.length || 0;
    throw new Error(
      `Dari ${totalUsers} user aktif ${DITBINMAS_CLIENT_ID} (${TARGET_ROLE}), tidak ditemukan data Kasat Binmas.`
    );
  }

  const { rows, totalKonten } = await getRekapLikesByClient(
    DITBINMAS_CLIENT_ID,
    periodInfo.type,
    periodInfo.tanggal,
    periodInfo.startDate,
    periodInfo.endDate,
    TARGET_ROLE
  );

  const likeMap = new Map();
  (rows || []).forEach((row) => {
    if (!row) return;
    likeMap.set(row.user_id, Number(row.jumlah_like) || 0);
  });

  const entries = kasatUsers.map((user) => {
    const displayName = formatNama(user) || "(Tanpa Nama)";
    const polres = user?.client_name || user?.client_id || "-";
    return {
      polres,
      displayName,
      title: user?.title,
      totalLikes: likeMap.get(user.user_id) || 0,
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = buildWorksheetRows(entries, periodInfo.label);
  XLSX.utils.book_append_sheet(wb, ws, "Rekap");

  await mkdir(EXPORT_DIR, { recursive: true });
  const filePath = path.join(EXPORT_DIR, buildFilename(periodInfo.label));
  XLSX.writeFile(wb, filePath);

  return { filePath, periodLabel: periodInfo.label, totalKonten: Number(totalKonten) || 0 };
}

export async function sendKasatBinmasLikesRecapExcel({
  period = "daily",
  chatId,
  waClient,
} = {}) {
  let filePath;
  let periodLabel;

  try {
    const { filePath: generatedPath, periodLabel: generatedLabel } =
      await generateKasatBinmasLikesRecapExcel({ period });
    filePath = generatedPath;
    periodLabel = generatedLabel;
    const buffer = await readFile(filePath);
    await sendWAFile(
      waClient,
      buffer,
      basename(filePath),
      chatId,
      EXCEL_MIME
    );
    await safeSendMessage(
      waClient,
      chatId,
      `✅ File rekap likes Kasat Binmas (${periodLabel}) dikirim.`
    );
    return { success: true, periodLabel };
  } catch (error) {
    console.error(
      "[submenu 44] Gagal mengirim rekap Likes Kasat Binmas (Excel):",
      error
    );
    const msg =
      error?.message &&
      (error.message.includes("direktorat") ||
        error.message.includes("Client tidak ditemukan") ||
        error.message.includes("Tidak ada data"))
        ? error.message
        : "❌ Gagal mengirim rekap Likes Kasat Binmas (Excel). Silakan coba lagi.";
    try {
      await safeSendMessage(waClient, chatId, msg);
    } catch (sendError) {
      console.error(
        "[submenu 44] Gagal mengirim pesan error rekap Likes Kasat Binmas (Excel):",
        sendError
      );
    }
    return { success: false, error };
  } finally {
    if (filePath) {
      try {
        await unlink(filePath);
      } catch (err) {
        console.error("Gagal menghapus file sementara rekap likes Kasat Binmas:", err);
      }
    }
  }
}

export default {
  generateKasatBinmasLikesRecapExcel,
  sendKasatBinmasLikesRecapExcel,
};
