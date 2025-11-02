import { getRekapLikesByClient } from '../model/instaLikeModel.js';
import { formatNama } from '../utils/utilsHelper.js';

const JAKARTA_TZ = 'Asia/Jakarta';
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const jakartaIsoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: JAKARTA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const jakartaDisplayFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: JAKARTA_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const jakartaWeekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: JAKARTA_TZ,
  weekday: 'short',
});

function ensureDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function getCurrentWeekRange() {
  const today = new Date();
  const isoToday = jakartaIsoFormatter.format(today);
  const weekdayAbbr = jakartaWeekdayFormatter.format(today);
  const weekdayIdx = WEEKDAY_ABBR.indexOf(weekdayAbbr);
  const todayJakarta = new Date(`${isoToday}T00:00:00Z`);
  const dayOfWeek = weekdayIdx === -1 ? todayJakarta.getUTCDay() : weekdayIdx;

  const weekEnd = new Date(todayJakarta);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + (6 - ((dayOfWeek + 6) % 7)));
  const weekStart = new Date(weekEnd);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  const formatIso = (date) => jakartaIsoFormatter.format(ensureDate(date));
  const formatDisplay = (date) => jakartaDisplayFormatter.format(ensureDate(date));

  return {
    startIso: formatIso(weekStart),
    endIso: formatIso(weekEnd),
    startDisplay: formatDisplay(weekStart),
    endDisplay: formatDisplay(weekEnd),
  };
}

function aggregateLikes(rows = []) {
  const userMap = new Map();
  rows.forEach((row = {}) => {
    const likeCount = Number(row.jumlah_like) || 0;
    const keyParts = [
      (row.title || '').trim().toUpperCase(),
      (row.nama || '').trim().toUpperCase(),
      (row.username || '').trim().toUpperCase(),
      (row.client_name || '').trim().toUpperCase(),
      (row.divisi || '').trim().toUpperCase(),
    ];
    const key = keyParts.join('|');
    if (!userMap.has(key)) {
      const formattedName = formatNama(row) || row.nama || row.username || 'Tanpa Nama';
      userMap.set(key, {
        name: formattedName,
        rank: row.title || '',
        satker: row.client_name || '',
        division: row.divisi || '',
        likes: 0,
      });
    }
    const entry = userMap.get(key);
    entry.likes += likeCount;
  });
  return Array.from(userMap.values());
}

function formatListSection(label, data = []) {
  if (!data.length) {
    return [`${label}`, '_Tidak ada data._'];
  }
  return [
    label,
    ...data.map((entry, idx) => {
      const parts = [entry.name];
      if (entry.satker) parts.push(entry.satker);
      if (entry.division) parts.push(entry.division);
      const info = parts.join(' • ');
      const likeWord = entry.likes === 1 ? 'like' : 'likes';
      return `${idx + 1}. ${info} — ${entry.likes} ${likeWord}`;
    }),
  ];
}

export async function generateWeeklyInstagramHighLowMessage(clientId = 'DITBINMAS') {
  const { startIso, endIso, startDisplay, endDisplay } = getCurrentWeekRange();
  let recap;
  try {
    recap = await getRekapLikesByClient(
      clientId,
      'harian',
      undefined,
      startIso,
      endIso,
      'ditbinmas'
    );
  } catch (error) {
    console.error('Gagal mengambil rekap likes mingguan:', error);
    return '❌ Gagal mengambil data likes Instagram mingguan.';
  }

  const rows = Array.isArray(recap?.rows) ? recap.rows : [];
  const totalTasks = Number(recap?.totalKonten) || 0;

  if (!rows.length) {
    return `🙏 Belum ada data likes Instagram untuk periode ${startDisplay} - ${endDisplay}.`;
  }

  const aggregated = aggregateLikes(rows).filter((entry) => entry.likes >= 0);
  if (!aggregated.length) {
    return `🙏 Belum ada data likes Instagram untuk periode ${startDisplay} - ${endDisplay}.`;
  }

  const totalLikes = aggregated.reduce((sum, entry) => sum + entry.likes, 0);

  const topUsers = aggregated
    .slice()
    .sort((a, b) => b.likes - a.likes || a.name.localeCompare(b.name))
    .slice(0, 5);
  const bottomUsers = aggregated
    .slice()
    .sort((a, b) => a.likes - b.likes || a.name.localeCompare(b.name))
    .slice(0, Math.min(5, aggregated.length));

  const lines = [
    '📊 *Instagram High & Low*',
    `Periode: ${startDisplay} - ${endDisplay}`,
    `Total tugas Instagram: ${totalTasks}`,
    `Total likes tercatat: ${totalLikes}`,
    '',
    ...formatListSection('🔥 *Top 5 Likes*', topUsers),
    '',
    ...formatListSection('❄️ *Bottom 5 Likes*', bottomUsers),
  ];

  return lines.filter(Boolean).join('\n').trim();
}

export default generateWeeklyInstagramHighLowMessage;
