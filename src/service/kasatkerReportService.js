import { collectEngagementRanking } from './engagementRankingExcelService.js';

const CATEGORY_RULES = [
  { key: 'aktif', label: 'Aktif', threshold: 90 },
  { key: 'sedang', label: 'Sedang', threshold: 50 },
  { key: 'rendah', label: 'Rendah', threshold: 0 },
];

const WA_FOLLOW_UP_LINK =
  'https://wa.me/?text=Konfirmasi%20tindak%20lanjut%20Laporan%20Kasatker';

function toPercentLabel(value) {
  const pct = Number.isFinite(value) ? Math.max(0, value) : 0;
  const rounded = Math.round(pct * 10) / 10;
  const formatted = Number.isInteger(rounded)
    ? rounded.toString()
    : rounded.toFixed(1);
  return `${formatted}%`;
}

function categorizeCompliance(compliancePct) {
  if (compliancePct >= CATEGORY_RULES[0].threshold) {
    return CATEGORY_RULES[0];
  }
  if (compliancePct >= CATEGORY_RULES[1].threshold) {
    return CATEGORY_RULES[1];
  }
  return CATEGORY_RULES[2];
}

function buildCategorySections(grouped) {
  return CATEGORY_RULES.map((rule) => {
    const entries = grouped[rule.key] || [];
    const title = `*${rule.label} (${entries.length} Satker)*`;
    if (!entries.length) {
      return `${title}\n-`; // menunjukkan tidak ada satker dalam kategori ini
    }

    const lines = entries.map((entry, idx) => {
      const note = entry.hasNoActivity ? ' (Belum ada pelaksanaan)' : '';
      return `${idx + 1}. ${entry.name} — ${entry.complianceLabel}${note}`;
    });

    return `${title}\n${lines.join('\n')}`;
  });
}

export async function generateKasatkerReport({
  clientId,
  roleFlag = null,
  period = 'today',
  startDate,
  endDate,
} = {}) {
  const {
    clientId: normalizedClientId,
    clientName,
    entries,
    periodInfo,
  } = await collectEngagementRanking(clientId, roleFlag, {
    period,
    startDate,
    endDate,
  });

  const periodLabel = periodInfo?.label || `Periode ${periodInfo?.period || period}`;

  const satkerEntries = (entries || []).filter(
    (entry) => entry?.cid !== normalizedClientId
  );
  const targetEntries = satkerEntries.length ? satkerEntries : entries || [];

  if (!targetEntries.length) {
    throw new Error('Tidak ada data satker untuk disusun.');
  }

  const grouped = targetEntries.reduce(
    (acc, entry) => {
      if (!entry || typeof entry !== 'object') {
        return acc;
      }
      const compliancePct = Number.isFinite(entry.score)
        ? Math.max(0, Math.min(1, entry.score)) * 100
        : 0;
      const category = categorizeCompliance(compliancePct);
      const item = {
        name: (entry.name || entry.cid || '').toUpperCase(),
        complianceValue: compliancePct,
        complianceLabel: toPercentLabel(compliancePct),
        hasNoActivity: compliancePct === 0,
      };
      if (!acc[category.key]) {
        acc[category.key] = [];
      }
      acc[category.key].push(item);
      return acc;
    },
    { aktif: [], sedang: [], rendah: [] }
  );

  Object.values(grouped).forEach((list) => {
    list.sort(
      (a, b) =>
        b.complianceValue - a.complianceValue || a.name.localeCompare(b.name, 'id-ID', { sensitivity: 'base' })
    );
  });

  const sections = buildCategorySections(grouped);

  const now = new Date();
  const tanggal = now.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const jam = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const headerLines = [
    `*KEPADA :* Yth. Para Kepala Satuan Kerja Jajaran ${(clientName || normalizedClientId).toUpperCase()}`,
    '*DARI :* Admin Monitoring Media Sosial Ditbinmas',
    '*TEMBUSAN :* Pimpinan Ditbinmas Korbinmas Baharkam Polri',
    '',
    `Laporan kepatuhan pengisian media sosial periode ${periodLabel}.`,
    `Disusun pada ${tanggal} pukul ${jam} WIB.`,
    '',
    '*KRITERIA KEPUHATAN*',
    '• ≥ 90% : Aktif',
    '• 50% – < 90% : Sedang',
    '• < 50% : Rendah',
    '',
    '*REKAP KEPATUHAN PER KATEGORI*',
  ];

  const followUpLines = [
    '',
    '*ARAHAN TINDAK LANJUT*',
    '1. Satker kategori *Sedang* agar meningkatkan intensitas pendampingan konten.',
    '2. Satker kategori *Rendah* wajib segera melaksanakan pengelolaan media sosial dan melaporkan progres maksimal 1x24 jam.',
    `Konfirmasi tindak lanjut melalui tautan: ${WA_FOLLOW_UP_LINK}`,
    '',
    'Terima kasih atas perhatian dan kerja samanya.',
  ];

  return [
    ...headerLines,
    ...sections,
    ...followUpLines,
  ]
    .filter((line) => line !== undefined && line !== null)
    .join('\n')
    .trim();
}

export default {
  generateKasatkerReport,
};
