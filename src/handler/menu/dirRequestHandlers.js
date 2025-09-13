import { getUsersSocialByClient, getClientsByRole } from "../../model/userModel.js";
import {
  absensiLikes,
  lapharDitbinmas,
  absensiLikesDitbinmasReport,
  collectLikesRecap,
} from "../fetchabsensi/insta/absensiLikesInsta.js";
import {
  lapharTiktokDitbinmas,
  collectKomentarRecap,
  absensiKomentar,
  absensiKomentarDitbinmasReport,
} from "../fetchabsensi/tiktok/absensiKomentarTiktok.js";
import { findClientById } from "../../service/clientService.js";
import { getGreeting, sortDivisionKeys, formatNama } from "../../utils/utilsHelper.js";
import { sendWAFile, safeSendMessage } from "../../utils/waHelper.js";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join, basename } from "path";
import { saveLikesRecapExcel } from "../../service/likesRecapExcelService.js";
import { saveCommentRecapExcel } from "../../service/commentRecapExcelService.js";
import { hariIndo } from "../../utils/constants.js";

const dirRequestGroup = "120363419830216549@g.us";

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

async function performAction(action, clientId, waClient, chatId, roleFlag, userClientId) {
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
      msg = await absensiLikesDitbinmas();
      break;
    case "4": {
      const normalizedId = (clientId || "").toUpperCase();
      if (normalizedId !== "DITBINMAS") {
        msg = "Menu ini hanya tersedia untuk client DITBINMAS.";
        break;
      }
      const opts = { mode: "all", roleFlag: "ditbinmas" };
      msg = await absensiLikes("DITBINMAS", opts);
      break;
    }
    case "5":
      msg = await absensiKomentarDitbinmasReport();
      break;
    case "6": {
      const { fetchAndStoreInstaContent } = await import(
        "../fetchpost/instaFetchPost.js"
      );
      const { handleFetchLikesInstagram } = await import(
        "../fetchengagement/fetchLikesInstagram.js"
      );
      const { rekapLikesIG } = await import(
        "../fetchabsensi/insta/absensiLikesInsta.js"
      );
      await fetchAndStoreInstaContent(
        ["shortcode", "caption", "like_count", "timestamp"],
        waClient,
        chatId,
        "DITBINMAS"
      );
      await handleFetchLikesInstagram(null, null, "DITBINMAS");
      const rekapMsg = await rekapLikesIG("DITBINMAS");
      msg =
        rekapMsg ||
        "Tidak ada konten IG untuk DIREKTORAT BINMAS hari ini.";
      break;
    }
    case "7": {
      const { handleFetchLikesInstagram } = await import(
        "../fetchengagement/fetchLikesInstagram.js"
      );
      await handleFetchLikesInstagram(waClient, chatId, "DITBINMAS");
      msg = "✅ Selesai fetch likes Instagram DITBINMAS.";
      break;
    }
    case "8": {
      const normalizedId = (clientId || "").toUpperCase();
      if (normalizedId !== "DITBINMAS") {
        msg = "Menu ini hanya tersedia untuk client DITBINMAS.";
        break;
      }
      const { fetchAndStoreTiktokContent } = await import(
        "../fetchpost/tiktokFetchPost.js"
      );
      const { handleFetchKomentarTiktokBatch } = await import(
        "../fetchengagement/fetchCommentTiktok.js"
      );
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
    case "9": {
      const { handleFetchKomentarTiktokBatch } = await import(
        "../fetchengagement/fetchCommentTiktok.js"
      );
      await handleFetchKomentarTiktokBatch(waClient, chatId, "DITBINMAS");
      msg = "✅ Selesai fetch komentar TikTok DITBINMAS.";
      break;
    }
    case "10": {
        const { text, filename, narrative, textBelum, filenameBelum } =
          await lapharDitbinmas();
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
          await sendWAFile(
            waClient,
            bufferBelum,
            filenameBelum,
            chatId,
            "text/plain"
          );
        }
        const recapData = await collectLikesRecap(clientId);
        if (recapData.shortcodes.length) {
          const excelPath = await saveLikesRecapExcel(recapData, clientId);
          const bufferExcel = await readFile(excelPath);
          await sendWAFile(
            waClient,
            bufferExcel,
            basename(excelPath),
            chatId,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
          await unlink(excelPath);
        }
        return;
      }
    case "11":
      msg = await formatRekapBelumLengkapDitbinmas();
      break;
    case "12": {
      const { fetchAndStoreInstaContent } = await import(
        "../fetchpost/instaFetchPost.js"
      );
      const { handleFetchLikesInstagram } = await import(
        "../fetchengagement/fetchLikesInstagram.js"
      );
      const { fetchAndStoreTiktokContent } = await import(
        "../fetchpost/tiktokFetchPost.js"
      );
      const { handleFetchKomentarTiktokBatch } = await import(
        "../fetchengagement/fetchCommentTiktok.js"
      );
      const { generateSosmedTaskMessage } = await import(
        "../fetchabsensi/sosmedTask.js"
      );
      const targetId = (clientId || "").toUpperCase();
      await fetchAndStoreInstaContent(
        ["shortcode", "caption", "like_count", "timestamp"],
        waClient,
        chatId,
        targetId
      );
      await handleFetchLikesInstagram(null, null, targetId);
        await fetchAndStoreTiktokContent(targetId, waClient, chatId);
        await handleFetchKomentarTiktokBatch(null, null, targetId);
        ({ text: msg } = await generateSosmedTaskMessage(targetId, true));
        break;
      }
    case "13": {
      const { text, filename, narrative, textBelum, filenameBelum } =
        await lapharTiktokDitbinmas();
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
        await sendWAFile(
          waClient,
          bufferBelum,
          filenameBelum,
          chatId,
          "text/plain"
        );
      }
      const recapData = await collectKomentarRecap(clientId);
      if (recapData.videoIds.length) {
        const excelPath = await saveCommentRecapExcel(recapData, clientId);
        const bufferExcel = await readFile(excelPath);
        await sendWAFile(
          waClient,
          bufferExcel,
          basename(excelPath),
          chatId,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        await unlink(excelPath);
      }
      return;
    }
    case "14": {
      const data = await collectLikesRecap(clientId);
      if (!data.shortcodes.length) {
        msg = `Tidak ada konten IG untuk *${clientId}* hari ini.`;
        break;
      }
      const filePath = await saveLikesRecapExcel(data, clientId);
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
    case "15": {
      const dirPath = "laphar";
      await mkdir(dirPath, { recursive: true });
      const [ig, tt] = await Promise.all([
        lapharDitbinmas(),
        lapharTiktokDitbinmas(),
      ]);
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
        await sendWAFile(
          waClient,
          bufferExcel,
          basename(excelPath),
          chatId,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
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
        await sendWAFile(
          waClient,
          bufferExcel,
          basename(excelPath),
          chatId,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        await unlink(excelPath);
      }
      return;
    }
    case "16": {
      const normalizedId = (clientId || "").toUpperCase();
      if (normalizedId !== "DITBINMAS") {
        msg = "Menu ini hanya tersedia untuk client DITBINMAS.";
        break;
      }
      const opts = { mode: "all", roleFlag: "ditbinmas" };
      msg = await absensiKomentar("DITBINMAS", opts);
      break;
    }
    default:
      msg = "Menu tidak dikenal.";
  }
  await waClient.sendMessage(chatId, msg.trim());
  if (action === "6" || action === "8" || action === "12") {
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
    const dir = await findClientById(chosen.role);
    session.client_ids = chosen.client_ids;
    session.dir_client_id =
      dir?.client_type?.toLowerCase() === "direktorat" ? chosen.role : null;
    delete session.dash_users;
    session.step = "main";
    await dirRequestHandlers.main(session, chatId, "", waClient);
  },

  async main(session, chatId, _text, waClient) {
    const originalIds = session.client_ids || [];
    const ids = [];
    for (const id of originalIds) {
      try {
        const client = await findClientById(id);
        if (client?.client_type?.toLowerCase() === "direktorat") {
          ids.push(id);
        }
      } catch {
        // ignore lookup errors
      }
    }
    session.client_ids = ids;

    if (!session.selectedClientId) {
      if (ids.length === 1) {
        session.selectedClientId = ids[0];
        const client = await findClientById(ids[0]);
        session.clientName = client?.nama || ids[0];
      } else if (ids.length > 1) {
        const list = await Promise.all(
          ids.map(async (id, idx) => {
            const c = await findClientById(id);
            const name = (c?.nama || id).toUpperCase();
            return `${idx + 1}. ${name} (${id.toUpperCase()})`;
          })
        );
        await waClient.sendMessage(
          chatId,
          `Pilih Client:\n\n${list.join("\n")}\n\nBalas angka untuk memilih atau *batal* untuk keluar.`
        );
        session.step = "choose_client";
        return;
      } else {
        await waClient.sendMessage(chatId, "Tidak ada client terkait.");
        return;
      }
    }

    const clientName = session.clientName;
      const menu =
        `Client: *${clientName}*\n` +
        "┏━━━ *MENU DIRREQUEST* ━━━\n" +
        "📊 *Rekap Data*\n" +
        "1️⃣ Rekap personel belum lengkapi data\n" +
        "2️⃣ Ringkasan pengisian data personel\n" +
        "1️⃣1️⃣ Rekap data belum lengkap Ditbinmas\n\n" +
        "📅 *Absensi*\n" +
        "3️⃣ Absensi like Ditbinmas\n" +
        "4️⃣ Absensi like Instagram\n" +
        "5️⃣ Absensi komentar Ditbinmas\n" +
        "1️⃣6️⃣ Absensi komentar TikTok\n\n" +
        "📥 *Pengambilan Data*\n" +
        "6️⃣ Ambil konten & like Instagram\n" +
        "7️⃣ Ambil like Instagram saja\n" +
        "8️⃣ Ambil konten & komentar TikTok\n" +
        "9️⃣ Ambil komentar TikTok saja\n" +
        "1️⃣2️⃣ Ambil semua sosmed & buat tugas\n\n" +
        "📝 *Laporan*\n" +
        "🔟 Laporan harian Instagram Ditbinmas\n" +
        "1️⃣3️⃣ Laporan harian TikTok Ditbinmas\n" +
        "1️⃣4️⃣ Rekap like Instagram (Excel)\n" +
        "1️⃣5️⃣ Rekap gabungan semua sosmed\n" +
        "┗━━━━━━━━━━━━━━━━━┛\n" +
        "Ketik *angka* menu atau *batal* untuk keluar.";
    await waClient.sendMessage(chatId, menu);
    session.step = "choose_menu";
  },

  async choose_client(session, chatId, text, waClient) {
    const idx = parseInt(text.trim(), 10) - 1;
    const ids = session.client_ids || [];
    if (isNaN(idx) || idx < 0 || idx >= ids.length) {
      await waClient.sendMessage(
        chatId,
        "Pilihan client tidak valid. Balas angka yang tersedia."
      );
      return;
    }
    session.selectedClientId = ids[idx];
    const client = await findClientById(session.selectedClientId);
    session.clientName = client?.nama || session.selectedClientId;
    await dirRequestHandlers.main(session, chatId, "", waClient);
  },

  async choose_menu(session, chatId, text, waClient) {
    const choice = text.trim();
    if (![
      "1",
      "2",
      "11",
      "3",
      "4",
      "5",
      "16",
      "6",
      "7",
      "8",
      "9",
      "12",
      "10",
      "13",
      "14",
      "15",
    ].includes(choice)) {
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
    await performAction(
      choice,
      taskClientId,
      waClient,
      chatId,
      session.role,
      userClientId
    );
    session.step = "main";
    await dirRequestHandlers.main(session, chatId, "", waClient);
  },
};

export {
  formatRekapUserData,
  absensiLikesDitbinmas,
  formatExecutiveSummary,
  formatRekapBelumLengkapDitbinmas,
  formatRekapAllSosmed,
};

export default dirRequestHandlers;

