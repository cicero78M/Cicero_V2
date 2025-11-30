import { findAllOrgClients } from "../model/clientModel.js";
import {
  fetchTodaySatbinmasOfficialMediaForOrgClients,
} from "./satbinmasOfficialMediaService.js";
import {
  fetchTodaySatbinmasOfficialTiktokMediaForOrgClients,
} from "./satbinmasOfficialTiktokMediaService.js";
import { findActiveByClientAndPlatform } from "../model/satbinmasOfficialAccountModel.js";
import { summarizeMediaCountsByAccounts } from "../model/satbinmasOfficialMediaModel.js";
import { summarizeSatbinmasTiktokPostsBySecuids } from "../model/tiktokSnapshotModel.js";

function formatNumber(value) {
  if (value == null) return "0";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function formatPeriodLabel(date = new Date()) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sortAccounts(activeAccounts, passiveAccounts, missingClients) {
  activeAccounts.sort(
    (a, b) =>
      b.total - a.total || a.clientLabel.localeCompare(b.clientLabel) || a.username.localeCompare(b.username)
  );
  passiveAccounts.sort((a, b) =>
    a.clientLabel.localeCompare(b.clientLabel) || a.username.localeCompare(b.username)
  );
  missingClients.sort((a, b) => a.localeCompare(b));
}

function buildAccountBuckets(clientSummaries) {
  const activeAccounts = [];
  const passiveAccounts = [];
  const missingClients = [];
  const failedAccounts = [];

  clientSummaries.forEach((clientSummary) => {
    const clientLabel = clientSummary.name?.trim() || clientSummary.clientId;

    if (!clientSummary.accounts.length) {
      missingClients.push(clientLabel);
    }

    clientSummary.accounts.forEach((account) => {
      const accountLine = {
        clientLabel,
        username: account.username,
        total: account.total,
        inserted: account.inserted,
        updated: account.updated,
        removed: account.removed,
        likes: account.likes,
        comments: account.comments,
      };

      if (account.total > 0) {
        activeAccounts.push(accountLine);
      } else {
        passiveAccounts.push(accountLine);
      }
    });

    clientSummary.errors.forEach((err) => {
      failedAccounts.push({
        clientLabel,
        username: err.username,
        message: err.message?.slice(0, 160) || "Gagal mengambil data",
      });
    });
  });

  sortAccounts(activeAccounts, passiveAccounts, missingClients);

  return { activeAccounts, passiveAccounts, missingClients, failedAccounts };
}

function renderInstagramRecap(summary, { periodLabel } = {}) {
  const { activeAccounts, passiveAccounts, missingClients, failedAccounts } = buildAccountBuckets(
    summary.clients
  );

  const lines = [
    "📸 Rekap konten Instagram Satbinmas Official",
    `Periode Pengambilan Data : ${periodLabel || formatPeriodLabel()}.`,
    `Total Polres     : ${formatNumber(summary.totals.clients)}`,
    `Total Akun      : ${formatNumber(summary.totals.accounts)}`,
    `Total Konten   : ${formatNumber(summary.totals.fetched)} konten.`,
  ];

  lines.push("", "🔥 Akun Aktif (urut jumlah konten tertinggi)");
  if (activeAccounts.length) {
    activeAccounts.forEach((account, index) => {
      lines.push(
        `${index + 1}. ${account.clientLabel} (@${account.username}):`,
        `- Jumlah Post Konten : ${formatNumber(account.total)} konten`,
        `- Total Likes : ${formatNumber(account.likes)} Likes`,
        `- Total Komentar : ${formatNumber(account.comments)} Komentar`,
        ""
      );
    });
    if (lines[lines.length - 1] === "") {
      lines.pop();
    }
  } else {
    lines.push("- Belum ada akun aktif hari ini.");
  }

  lines.push("", "🌙 Akun Pasif");
  if (passiveAccounts.length) {
    passiveAccounts.forEach((account, index) => {
      lines.push(`${index + 1}. ${account.clientLabel} (@${account.username}):`);
    });
  } else {
    lines.push("- Tidak ada akun pasif.");
  }

  lines.push("", "🚫 Belum Input Akun");
  if (missingClients.length) {
    missingClients.forEach((label, index) => {
      lines.push(`${index + 1}. ${label}`);
    });
  } else {
    lines.push("- Semua client ORG sudah memiliki akun terdaftar.");
  }

  if (failedAccounts.length) {
    lines.push("", "⚠️ Gagal mengambil beberapa akun:");
    failedAccounts.forEach((err) => {
      lines.push(`- @${err.username} (${err.clientLabel}): ${err.message}`);
    });
  }

  return lines.join("\n");
}

function renderTiktokRecap(summary, { periodLabel } = {}) {
  const { activeAccounts, passiveAccounts, missingClients, failedAccounts } = buildAccountBuckets(
    summary.clients
  );
  const totals =
    summary?.totals || { clients: 0, accounts: 0, fetched: 0, inserted: 0, updated: 0, failed: 0 };

  const lines = [
    "🎵 Rekap konten TikTok Satbinmas Official",
    `Periode Pengambilan Data : ${periodLabel || formatPeriodLabel()}.`,
    `Total Polres     : ${formatNumber(totals.clients)}`,
    `Total Akun      : ${formatNumber(totals.accounts)}`,
    `Total Konten   : ${formatNumber(totals.fetched)} konten`,
  ];

  lines.push("", "🔥 Akun Aktif (urut jumlah konten tertinggi)");
  if (activeAccounts.length) {
    activeAccounts.forEach((account, idx) => {
      lines.push(
        `${idx + 1}. ${account.clientLabel}(@${account.username}):`,
        `- Jumlah Post Konten : ${formatNumber(account.total)} konten`,
        `- Total Likes : ${formatNumber(account.likes)} Likes`,
        `- Total Komentar : ${formatNumber(account.comments)} Komentar`
      );
    });
  } else {
    lines.push("- Belum ada akun aktif hari ini.");
  }

  lines.push("", "🌙 Akun Pasif");
  if (passiveAccounts.length) {
    passiveAccounts.forEach((account, idx) => {
      lines.push(`${idx + 1}. ${account.clientLabel}(@${account.username})`);
    });
  } else {
    lines.push("- Tidak ada akun pasif.");
  }

  lines.push("", "🚫 Belum Input Akun");
  if (missingClients.length) {
    missingClients.forEach((label, idx) => {
      lines.push(`${idx + 1}. ${label}`);
    });
  } else {
    lines.push("- Semua client ORG sudah memiliki akun terdaftar.");
  }

  if (failedAccounts.length) {
    lines.push("", "⚠️ Gagal mengambil beberapa akun:");
    failedAccounts.forEach((err) => {
      lines.push(`- @${err.username} (${err.clientLabel}): ${err.message}`);
    });
  }

  return lines.join("\n");
}

export async function buildSatbinmasOfficialInstagramRecap() {
  const summary = await fetchTodaySatbinmasOfficialMediaForOrgClients();
  return renderInstagramRecap(summary);
}

export async function buildSatbinmasOfficialTiktokRecap() {
  const summary = await fetchTodaySatbinmasOfficialTiktokMediaForOrgClients();
  return renderTiktokRecap(summary);
}

function resolvePeriodRange(period) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === "weekly") {
    const day = start.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + offset);
  }

  if (period === "monthly") {
    start.setDate(1);
  }

  const end = new Date(start);
  if (period === "monthly") {
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setDate(end.getDate() + 1 * (period === "weekly" ? 7 : 1));
  }

  return { start, end };
}

function formatPeriodDescription(period) {
  if (period === "weekly") return "Rekap mingguan (Senin - Minggu)";
  if (period === "monthly") return "Rekap bulanan (1 s/d akhir bulan)";
  return "Rekap harian (hari ini)";
}

async function buildInstagramSummaryFromStorage(period = "daily") {
  const clients = await findAllOrgClients();
  const { start, end } = resolvePeriodRange(period);

  const summary = {
    clients: [],
    totals: { clients: clients.length, accounts: 0, fetched: 0 },
  };

  for (const client of clients) {
    const accounts = await findActiveByClientAndPlatform(client.client_id, "instagram");
    const clientSummary = { clientId: client.client_id, name: client.nama, accounts: [], errors: [] };

    if (accounts.length) {
      const statsMap = await summarizeMediaCountsByAccounts(
        accounts.map((acc) => acc.satbinmas_account_id),
        start,
        end
      );

      accounts.forEach((account) => {
        const stats = statsMap.get(account.satbinmas_account_id) || {
          total: 0,
          likes: 0,
          comments: 0,
        };

        summary.totals.accounts += 1;
        summary.totals.fetched += stats.total;

        clientSummary.accounts.push({
          username: account.username,
          total: stats.total,
          inserted: 0,
          updated: 0,
          removed: 0,
          likes: stats.likes,
          comments: stats.comments,
        });
      });
    }

    summary.clients.push(clientSummary);
  }

  return summary;
}

async function buildTiktokSummaryFromStorage(period = "daily") {
  const clients = await findAllOrgClients();
  const { start, end } = resolvePeriodRange(period);

  const summary = {
    clients: [],
    totals: { clients: clients.length, accounts: 0, fetched: 0 },
  };

  for (const client of clients) {
    const accounts = await findActiveByClientAndPlatform(client.client_id, "tiktok");
    const clientSummary = { clientId: client.client_id, name: client.nama, accounts: [], errors: [] };
    const usableAccounts = accounts.filter((acc) => acc.secUid?.trim());

    if (usableAccounts.length) {
      const statsMap = await summarizeSatbinmasTiktokPostsBySecuids(
        usableAccounts.map((acc) => acc.secUid),
        start,
        end
      );

      usableAccounts.forEach((account) => {
        const stats = statsMap.get(account.secUid) || {
          total: 0,
          likes: 0,
          comments: 0,
        };

        summary.totals.accounts += 1;
        summary.totals.fetched += stats.total;

        clientSummary.accounts.push({
          username: account.username,
          total: stats.total,
          inserted: 0,
          updated: 0,
          removed: 0,
          likes: stats.likes,
          comments: stats.comments,
        });
      });
    }

    const missingSecUidAccounts = accounts.filter((acc) => !acc.secUid?.trim());
    missingSecUidAccounts.forEach((account) => {
      clientSummary.errors.push({
        username: account.username,
        message: "secUid TikTok belum tersinkron.",
      });
      summary.totals.accounts += 1;
    });

    summary.clients.push(clientSummary);
  }

  return summary;
}

export async function buildStoredSatbinmasOfficialInstagramRecap(period = "daily") {
  const summary = await buildInstagramSummaryFromStorage(period);
  const label = `${formatPeriodDescription(period)} (${formatPeriodLabel()})`;
  return renderInstagramRecap(summary, { periodLabel: label });
}

export async function buildStoredSatbinmasOfficialTiktokRecap(period = "daily") {
  const summary = await buildTiktokSummaryFromStorage(period);
  const label = `${formatPeriodDescription(period)} (${formatPeriodLabel()})`;
  return renderTiktokRecap(summary, { periodLabel: label });
}
