import { mkdir } from "fs/promises";
import path from "path";
import XLSX from "xlsx";

import { findClientById } from "./clientService.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { getLikesSets, groupUsersByClientDivision, normalizeUsername } from "../utils/likesHelper.js";
import { getPostsTodayByClient } from "../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../model/tiktokCommentModel.js";
import { computeDitbinmasLikesStats } from "../handler/fetchabsensi/insta/ditbinmasLikesUtils.js";
import { hariIndo } from "../utils/constants.js";

const EXPORT_DIR = path.resolve("export_data/engagement_ranking");

function sanitizeFilename(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractUsernamesFromComments(comments) {
  return (comments || [])
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") return item;
      if (typeof item.username === "string") return item.username;
      if (item.user && typeof item.user.unique_id === "string") {
        return item.user.unique_id;
      }
      return "";
    })
    .map((username) => normalizeUsername(username))
    .filter(Boolean);
}

function computeCommentSummary(users = [], commentSets = [], totalKonten = 0) {
  const sets = Array.isArray(commentSets) ? commentSets : [];
  return users.reduce(
    (acc, user) => {
      if (!user || typeof user !== "object") {
        return acc;
      }

      acc.total += 1;
      if (user.exception === true) {
        acc.lengkap += 1;
        return acc;
      }

      const username = normalizeUsername(user.tiktok);
      if (!username) {
        acc.noUsername += 1;
        return acc;
      }

      let count = 0;
      sets.forEach((set) => {
        if (set && typeof set.has === "function" && set.has(username)) {
          count += 1;
        }
      });

      if (totalKonten > 0) {
        if (count >= totalKonten) acc.lengkap += 1;
        else if (count > 0) acc.kurang += 1;
        else acc.belum += 1;
      } else {
        acc.belum += 1;
      }

      return acc;
    },
    { total: 0, lengkap: 0, kurang: 0, belum: 0, noUsername: 0 }
  );
}

async function getClientInfoCached(cache, clientId) {
  const key = String(clientId || "").toLowerCase();
  if (!cache.has(key)) {
    cache.set(key, await findClientById(key));
  }
  return cache.get(key);
}

export async function collectEngagementRanking(clientId, roleFlag = null) {
  const clientIdStr = String(clientId || "").trim();
  if (!clientIdStr) {
    throw new Error("Client tidak ditemukan.");
  }

  const normalizedClientId = clientIdStr.toLowerCase();
  const client = await findClientById(normalizedClientId);
  if (!client) {
    throw new Error("Client tidak ditemukan.");
  }
  if (client.client_type?.toLowerCase() !== "direktorat") {
    throw new Error("Menu ini hanya tersedia untuk direktorat.");
  }

  const roleName = (roleFlag || normalizedClientId).toLowerCase();
  const { polresIds, usersByClient } = await groupUsersByClientDivision(roleName);

  const allIds = new Set(
    [
      ...polresIds.map((id) => String(id || "").toUpperCase()),
      normalizedClientId.toUpperCase(),
      ...Object.keys(usersByClient || {}),
    ].filter(Boolean)
  );

  const shortcodes = await getShortcodesTodayByClient(roleName);
  const likesSets = shortcodes.length ? await getLikesSets(shortcodes) : [];
  const totalIgPosts = shortcodes.length;

  const tiktokPosts = await getPostsTodayByClient(roleName);
  const commentSets = [];
  for (const post of tiktokPosts) {
    try {
      const { comments } = await getCommentsByVideoId(post.video_id);
      commentSets.push(new Set(extractUsernamesFromComments(comments)));
    } catch (error) {
      console.error(
        "Gagal mengambil komentar TikTok untuk",
        post.video_id,
        error
      );
      commentSets.push(new Set());
    }
  }
  const totalTtPosts = tiktokPosts.length;

  const clientCache = new Map();
  const entries = [];
  const totals = {
    totalPersonil: 0,
    igSudah: 0,
    igBelum: 0,
    igKosong: 0,
    ttSudah: 0,
    ttBelum: 0,
    ttKosong: 0,
  };

  for (const cidRaw of allIds) {
    const cidUpper = String(cidRaw || "").toUpperCase();
    const users = usersByClient?.[cidUpper] || [];

    const { summary: igSummary } = computeDitbinmasLikesStats(
      users,
      likesSets,
      totalIgPosts
    );
    const ttSummary = computeCommentSummary(users, commentSets, totalTtPosts);

    const totalPersonil = users.length;
    const igSudah = (igSummary.lengkap || 0) + (igSummary.kurang || 0);
    const igBelum = igSummary.belum || 0;
    const igKosong = igSummary.noUsername || 0;
    const ttSudah = (ttSummary.lengkap || 0) + (ttSummary.kurang || 0);
    const ttBelum = ttSummary.belum || 0;
    const ttKosong = ttSummary.noUsername || 0;

    const info = await getClientInfoCached(clientCache, cidUpper);
    const name = (info?.nama || cidUpper).toUpperCase();

    const igPct = totalPersonil ? igSudah / totalPersonil : 0;
    const ttPct = totalPersonil ? ttSudah / totalPersonil : 0;
    const score = totalPersonil ? (igPct + ttPct) / 2 : 0;

    entries.push({
      cid: cidUpper.toLowerCase(),
      name,
      totalPersonil,
      igSudah,
      igBelum,
      igKosong,
      ttSudah,
      ttBelum,
      ttKosong,
      igPct,
      ttPct,
      score,
    });

    totals.totalPersonil += totalPersonil;
    totals.igSudah += igSudah;
    totals.igBelum += igBelum;
    totals.igKosong += igKosong;
    totals.ttSudah += ttSudah;
    totals.ttBelum += ttBelum;
    totals.ttKosong += ttKosong;
  }

  if (!entries.length) {
    throw new Error("Tidak ada data engagement untuk direkap.");
  }

  const primaryCid = normalizedClientId;
  entries.sort((a, b) => {
    if (a.cid === primaryCid && b.cid !== primaryCid) return -1;
    if (b.cid === primaryCid && a.cid !== primaryCid) return 1;
    if (b.score !== a.score) return b.score - a.score;
    if (b.igPct !== a.igPct) return b.igPct - a.igPct;
    if (b.ttPct !== a.ttPct) return b.ttPct - a.ttPct;
    if (b.totalPersonil !== a.totalPersonil) {
      return b.totalPersonil - a.totalPersonil;
    }
    return a.name.localeCompare(b.name, "id-ID", { sensitivity: "base" });
  });

  return {
    clientId: normalizedClientId,
    clientName: client.nama || clientIdStr,
    roleName,
    entries,
    totals,
    igPostsCount: totalIgPosts,
    ttPostsCount: totalTtPosts,
  };
}

export async function saveEngagementRankingExcel({
  clientId,
  roleFlag = null,
} = {}) {
  const {
    clientName,
    entries,
    totals,
    igPostsCount,
    ttPostsCount,
  } = await collectEngagementRanking(clientId, roleFlag);

  const now = new Date();
  const hari = hariIndo[now.getDay()] || now.toLocaleDateString("id-ID", { weekday: "long" });
  const tanggal = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const aoa = [
    [`Rekap Ranking Engagement ${(clientName || "").toUpperCase()}`],
    [`Hari, Tanggal: ${hari}, ${tanggal}`],
    [`Jumlah Post Instagram: ${igPostsCount}`],
    [`Jumlah Post TikTok: ${ttPostsCount}`],
    [],
    [
      "Nama Satker",
      "Jumlah Personil",
      "Instagram",
      null,
      null,
      "TikTok",
      null,
      null,
    ],
    [
      null,
      null,
      "Sudah",
      "Belum",
      "Username Kosong",
      "Sudah",
      "Belum",
      "Username Kosong",
    ],
  ];

  entries.forEach((entry, idx) => {
    aoa.push([
      `${idx + 1}. ${entry.name}`,
      entry.totalPersonil,
      entry.igSudah,
      entry.igBelum,
      entry.igKosong,
      entry.ttSudah,
      entry.ttBelum,
      entry.ttKosong,
    ]);
  });

  aoa.push([
    "TOTAL",
    totals.totalPersonil,
    totals.igSudah,
    totals.igBelum,
    totals.igKosong,
    totals.ttSudah,
    totals.ttBelum,
    totals.ttKosong,
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 7 } },
    { s: { r: 5, c: 0 }, e: { r: 6, c: 0 } },
    { s: { r: 5, c: 1 }, e: { r: 6, c: 1 } },
    { s: { r: 5, c: 2 }, e: { r: 5, c: 4 } },
    { s: { r: 5, c: 5 }, e: { r: 5, c: 7 } },
  ];
  worksheet["!freeze"] = { xSplit: 0, ySplit: 7 };

  const columnCount = 8;
  const tableHeaderRows = [5, 6];
  const dataStartRow = 7;
  const totalRow = dataStartRow + entries.length;
  const tableEndRow = totalRow;

  function columnToLetters(col) {
    let dividend = col + 1;
    let columnName = "";
    while (dividend > 0) {
      const modulo = (dividend - 1) % 26;
      columnName = String.fromCharCode(65 + modulo) + columnName;
      dividend = Math.floor((dividend - modulo) / 26);
    }
    return columnName;
  }

  function cellAddress(row, col) {
    return `${columnToLetters(col)}${row + 1}`;
  }

  function ensureCell(sheet, row, col) {
    const address = cellAddress(row, col);
    if (!sheet[address]) {
      sheet[address] = { t: "s", v: "" };
    }
    return sheet[address];
  }

  const mediumBorder = { style: "medium", color: { rgb: "000000" } };
  const thinBorder = { style: "thin", color: { rgb: "000000" } };
  const headerFill = { patternType: "solid", fgColor: { rgb: "D9D9D9" } };
  const zebraFill = { patternType: "solid", fgColor: { rgb: "F5F5F5" } };

  const headerBottomRow = tableHeaderRows[tableHeaderRows.length - 1];

  for (let row = 5; row <= tableEndRow; row += 1) {
    for (let col = 0; col < columnCount; col += 1) {
      const cell = ensureCell(worksheet, row, col);
      const style = { ...(cell.s || {}) };
      style.border = {
        top: row === tableHeaderRows[0] ? mediumBorder : thinBorder,
        bottom:
          row === tableEndRow || row === headerBottomRow ? mediumBorder : thinBorder,
        left: col === 0 ? mediumBorder : thinBorder,
        right: col === columnCount - 1 ? mediumBorder : thinBorder,
      };

      if (tableHeaderRows.includes(row)) {
        style.font = { ...(style.font || {}), bold: true };
        style.alignment = {
          horizontal: "center",
          vertical: "center",
          wrapText: true,
        };
        style.fill = headerFill;
      } else if (row >= dataStartRow && row < totalRow && (row - dataStartRow) % 2 === 1) {
        style.fill = zebraFill;
      }

      cell.s = style;
    }
  }

  const columnWidths = Array.from({ length: columnCount }, () => 10);
  aoa.forEach((row) => {
    row.forEach((value, colIdx) => {
      if (colIdx >= columnCount) return;
      let cellText = "";
      if (value === null || typeof value === "undefined") {
        cellText = "";
      } else if (typeof value === "object") {
        if (value && typeof value.v !== "undefined") {
          cellText = String(value.v ?? "");
        } else if (value && typeof value.f !== "undefined") {
          cellText = String(value.f ?? "");
        } else if (value && typeof value.w !== "undefined") {
          cellText = String(value.w ?? "");
        }
      } else {
        cellText = String(value);
      }
      columnWidths[colIdx] = Math.max(columnWidths[colIdx], cellText.length + 2);
    });
  });
  worksheet["!cols"] = columnWidths.map((width) => ({ wch: Math.min(Math.max(width, 12), 40) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Ranking Engagement");

  await mkdir(EXPORT_DIR, { recursive: true });
  const dateLabel = now.toISOString().slice(0, 10);
  const clientSlug = sanitizeFilename(clientName || clientId || "Direktorat");
  const fileName = `${clientSlug}_Rekap_Ranking_Engagement_${dateLabel}.xlsx`;
  const filePath = path.join(EXPORT_DIR, fileName);

  XLSX.writeFile(workbook, filePath, { cellStyles: true });
  return { filePath, fileName };
}

export default saveEngagementRankingExcel;
