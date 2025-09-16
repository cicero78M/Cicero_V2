import { mkdir } from "fs/promises";
import path from "path";
import XLSX from "xlsx";
import { getUsersSocialByClient, getClientsByRole } from "../model/userModel.js";
import { findClientById } from "./clientService.js";

const DIRECTORATE_ROLES = ["ditbinmas", "ditlantas", "bidhumas"];

function sanitizeFilename(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toPercent(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(2));
}

export async function collectSatkerUpdateMatrix(clientId, roleFlag = null) {
  const clientIdStr = String(clientId || "").trim();
  if (!clientIdStr) {
    throw new Error("Client tidak ditemukan.");
  }

  const normalizedClientId = clientIdStr.toLowerCase();
  const client = await findClientById(normalizedClientId);
  if (!client) {
    throw new Error("Client tidak ditemukan.");
  }

  const filterRole = DIRECTORATE_ROLES.includes(roleFlag?.toLowerCase())
    ? roleFlag
    : null;

  const clientType = client.client_type?.toLowerCase();
  const isDirektoratView =
    clientType === "direktorat" ||
    DIRECTORATE_ROLES.includes(normalizedClientId) ||
    (filterRole && DIRECTORATE_ROLES.includes(filterRole.toLowerCase()));

  if (!isDirektoratView) {
    throw new Error("Menu ini hanya tersedia untuk direktorat.");
  }

  const users = await getUsersSocialByClient(clientIdStr, filterRole);
  const groups = new Map();
  users.forEach((user) => {
    const cid = String(user.client_id || "").toLowerCase();
    if (!cid) return;
    if (!groups.has(cid)) {
      groups.set(cid, { total: 0, insta: 0, tiktok: 0 });
    }
    const stat = groups.get(cid);
    stat.total += 1;
    if (user.insta) stat.insta += 1;
    if (user.tiktok) stat.tiktok += 1;
  });

  const roleName = (filterRole || clientIdStr).toLowerCase();
  const clientIdsFromRole = (await getClientsByRole(roleName)) || [];
  const allIds = new Set([
    normalizedClientId,
    ...clientIdsFromRole.map((id) => String(id || "").toLowerCase()).filter(Boolean),
    ...groups.keys(),
  ]);

  const stats = await Promise.all(
    [...allIds].map(async (cid) => {
      const stat = groups.get(cid) || { total: 0, insta: 0, tiktok: 0 };
      const clientInfo = await findClientById(cid);
      const displayName = (clientInfo?.nama || cid || "-").toUpperCase();
      const total = stat.total;
      const instaFilled = stat.insta;
      const tiktokFilled = stat.tiktok;
      const instaEmpty = Math.max(total - instaFilled, 0);
      const tiktokEmpty = Math.max(total - tiktokFilled, 0);
      return {
        cid,
        name: displayName,
        total,
        instaFilled,
        instaEmpty,
        instaPercent: toPercent(instaFilled, total),
        tiktokFilled,
        tiktokEmpty,
        tiktokPercent: toPercent(tiktokFilled, total),
      };
    })
  );

  const primary = stats.find((s) => s.cid === normalizedClientId);
  const others = stats
    .filter((s) => s.cid !== normalizedClientId)
    .sort((a, b) => {
      if (b.instaPercent !== a.instaPercent) return b.instaPercent - a.instaPercent;
      if (b.tiktokPercent !== a.tiktokPercent) return b.tiktokPercent - a.tiktokPercent;
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name, "id-ID", { sensitivity: "base" });
    });

  const orderedStats = primary ? [primary, ...others] : others;

  const totals = orderedStats.reduce(
    (acc, item) => {
      acc.total += item.total;
      acc.instaFilled += item.instaFilled;
      acc.instaEmpty += item.instaEmpty;
      acc.tiktokFilled += item.tiktokFilled;
      acc.tiktokEmpty += item.tiktokEmpty;
      return acc;
    },
    { total: 0, instaFilled: 0, instaEmpty: 0, tiktokFilled: 0, tiktokEmpty: 0 }
  );

  return {
    clientName: client.nama || clientIdStr.toUpperCase(),
    clientId: normalizedClientId,
    stats: orderedStats,
    totals,
  };
}

export async function saveSatkerUpdateMatrixExcel({
  clientId,
  roleFlag = null,
  username = "",
} = {}) {
  const { stats } = await collectSatkerUpdateMatrix(clientId, roleFlag);
  if (!stats.length) {
    throw new Error("Tidak ada data satker untuk direkap.");
  }

  const header = [
    "Satker",
    "Jumlah Personil",
    "Sudah Update Instagram",
    "Belum Update Instagram",
    "Prosentase Sudah Update Instagram",
    "Sudah Update Tiktok",
    "Belum Update Tiktok",
    "Prosentase Sudah Update Tiktok",
  ];

  const rows = stats.map((item) => [
    item.name,
    item.total,
    item.instaFilled,
    item.instaEmpty,
    item.instaPercent,
    item.tiktokFilled,
    item.tiktokEmpty,
    item.tiktokPercent,
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap");

  const exportDir = path.resolve("export_data/satker_update_matrix");
  await mkdir(exportDir, { recursive: true });

  const now = new Date();
  const dateLabel = now.toISOString().slice(0, 10);
  const safeUsername = sanitizeFilename(username) || "User";
  const fileName = `Satker_${safeUsername}_Update_Rank_${dateLabel}.xlsx`;
  const filePath = path.join(exportDir, fileName);

  XLSX.writeFile(workbook, filePath);
  return { filePath, fileName };
}

export default saveSatkerUpdateMatrixExcel;
