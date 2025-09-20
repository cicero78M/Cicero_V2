import { getUsersSocialByClient, getClientsByRole } from "../../model/userModel.js";
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
import { findClientById } from "../../service/clientService.js";
import { getGreeting, sortDivisionKeys, formatNama } from "../../utils/utilsHelper.js";
import { sendWAFile, safeSendMessage } from "../../utils/waHelper.js";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join, basename } from "path";
import { saveLikesRecapExcel } from "../../service/likesRecapExcelService.js";
import { saveCommentRecapExcel } from "../../service/commentRecapExcelService.js";
import { saveWeeklyLikesRecapExcel } from "../../service/weeklyLikesRecapExcelService.js";
import { saveWeeklyCommentRecapExcel } from "../../service/weeklyCommentRecapExcelService.js";
import { saveMonthlyLikesRecapExcel } from "../../service/monthlyLikesRecapExcelService.js";
import { saveSatkerUpdateMatrixExcel } from "../../service/satkerUpdateMatrixService.js";
import { saveEngagementRankingExcel } from "../../service/engagementRankingExcelService.js";
import { hariIndo } from "../../utils/constants.js";

const dirRequestGroup = "120363419830216549@g.us";
const DITBINMAS_CLIENT_ID = "DITBINMAS";

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
    const cid = (u.client_id || "").toLowerCase();
    if (!groups[cid]) groups[cid] = { total: 0, insta: 0, tiktok: 0 };
    groups[cid].total++;
    if (u.insta) groups[cid].insta++;
    if (u.tiktok) groups[cid].tiktok++;
  });
  const stats = await Promise.all(
    Object.entries(groups).map(async ([cid, stat]) => {
      const client = await findClientById(cid);
      const name = (client?.nama || cid).toUpperCase();
      const igPct = stat.total ? (stat.insta / stat.total) * 100 : 0;
      const ttPct = stat.total ? (stat.tiktok / stat.total) * 100 : 0;
      return { cid, name, ...stat, igPct, ttPct };
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
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const parsePart = (text) => {
    const afterDir = text.split("DIREKTORAT BINMAS")[1] || "";
    const [beforeUpdate, afterUpdate = ""] = afterDir.split("Absensi Update Data");
    return { beforeUpdate: beforeUpdate.trim(), afterUpdate: afterUpdate.trim() };
    };

  const igParts = parsePart(igNarrative);
  const ttParts = parsePart(ttNarrative);

  const intro =
    `Mohon Ijin Komandan, melaporkan perkembangan implementasi update data dan absensi engagement Instagram, TikTok dan update data oleh personil hari ${hari}, ${tanggal} pukul ${jam} WIB.\n\n` +
    `DIREKTORAT BINMAS\n\n`;

  const updateSection = igParts.afterUpdate
    ? `ABSENSI UPDATE DATA PERSONIL\n\n${igParts.afterUpdate}`.trim()
    : "";

  return [
    `${intro}${igParts.beforeUpdate}`,
    ttParts.beforeUpdate,
    updateSection,
  ]
    .filter(Boolean)
    .join("\n\n")
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
    case "12": {
      const { handleFetchLikesInstagram } = await import("../fetchengagement/fetchLikesInstagram.js");
      await handleFetchLikesInstagram(waClient, chatId, "DITBINMAS");
      msg = "✅ Selesai fetch likes Instagram DITBINMAS.";
      break;
    }
    case "13": {
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
    case "14": {
      const { handleFetchKomentarTiktokBatch } = await import("../fetchengagement/fetchCommentTiktok.js");
      await handleFetchKomentarTiktokBatch(waClient, chatId, "DITBINMAS");
      msg = "✅ Selesai fetch komentar TikTok DITBINMAS.";
      break;
    }
    case "15": {
      const { fetchAndStoreInstaContent } = await import("../fetchpost/instaFetchPost.js");
      const { handleFetchLikesInstagram } = await import("../fetchengagement/fetchLikesInstagram.js");
      const { fetchAndStoreTiktokContent } = await import("../fetchpost/tiktokFetchPost.js");
      const { handleFetchKomentarTiktokBatch } = await import("../fetchengagement/fetchCommentTiktok.js");
      const { generateSosmedTaskMessage } = await import("../fetchabsensi/sosmedTask.js");
        const targetId = (clientId || "").toUpperCase();
        const fetchErrors = [];
        try {
          await fetchAndStoreInstaContent(["shortcode", "caption", "like_count", "timestamp"], waClient, chatId, targetId);
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
        try {
          ({ text: msg } = await generateSosmedTaskMessage(targetId, { skipTiktokFetch: true, skipLikesFetch: true }));
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
      case "16": {
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
      case "17": {
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
      case "18": {
        const data = await collectLikesRecap(clientId);
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
      case "19": {
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
      case "20": {
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
      case "22": {
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
      case "23": {
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
      case "24": {
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
      default:
        msg = "Menu tidak dikenal.";
    }
    await waClient.sendMessage(chatId, msg.trim());
    if (action === "11" || action === "13" || action === "15") {
      await safeSendMessage(waClient, dirRequestGroup, msg.trim());
    }
  }

export const dirRequestHandlers = {
  async choose_dash_user(session, chatId, text, waClient) {
    const dashUsers = session.dash_users || [];
    if (!text) {
      const list = await Promise.all(
        dashUsers.map(async (u, idx) => {
          let cid = u.client_ids[0];
          let c = cid ? await findClientById(cid) : null;
          if (!cid || c?.client_type?.toLowerCase() === "direktorat") {
            cid = u.role;
            c = await findClientById(cid);
          }
          const name = (c?.nama || cid).toUpperCase();
          return `${idx + 1}. ${name} (${cid.toUpperCase()})`;
        })
      );
      await waClient.sendMessage(
        chatId,
        `Pilih Client:\n${list.join("\n")}\n\nBalas angka untuk memilih atau *batal* untuk keluar.`
      );
      return;
    }
    const idx = parseInt(text.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= dashUsers.length) {
      await waClient.sendMessage(
        chatId,
        "Pilihan client tidak valid. Balas angka yang tersedia."
      );
      return;
    }
    const chosen = dashUsers[idx];
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
        "1️⃣0️⃣ Absensi komentar Ditbinmas\n\n" +
        "📥 *Pengambilan Data*\n" +
        "1️⃣1️⃣ Ambil konten & like Instagram\n" +
        "1️⃣2️⃣ Ambil like Instagram saja\n" +
        "1️⃣3️⃣ Ambil konten & komentar TikTok\n" +
        "1️⃣4️⃣ Ambil komentar TikTok saja\n" +
        "1️⃣5️⃣ Ambil semua sosmed & buat tugas\n\n" +
        "📝 *Laporan*\n" +
        "1️⃣6️⃣ Laporan harian Instagram Ditbinmas\n" +
        "1️⃣7️⃣ Laporan harian TikTok Ditbinmas\n" +
        "1️⃣8️⃣ Rekap like Instagram (Excel)\n" +
        "1️⃣9️⃣ Rekap komentar TikTok (Excel)\n" +
        "2️⃣0️⃣ Rekap gabungan semua sosmed\n" +
        "2️⃣1️⃣ Rekap ranking engagement jajaran\n\n" +
        "📆 *Laporan Mingguan*\n" +
        "2️⃣2️⃣ Rekap file Instagram mingguan\n" +
        "2️⃣3️⃣ Rekap file Tiktok mingguan\n\n" +
        "🗓️ *Laporan Bulanan*\n" +
        "2️⃣4️⃣ Rekap file Instagram bulanan\n\n" +
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

    if (choice === "21") {
      session.step = "choose_engagement_recap_period";
      await waClient.sendMessage(chatId, ENGAGEMENT_RECAP_MENU_TEXT);
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
};

export {
  formatRekapUserData,
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

