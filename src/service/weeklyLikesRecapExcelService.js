import { mkdir } from 'fs/promises';
import path from 'path';
import XLSX from 'xlsx';
import { hariIndo } from '../utils/constants.js';
import { getRekapLikesByClient } from '../model/instaLikeModel.js';

const RANK_ORDER = [
  'KOMISARIS BESAR POLISI',
  'AKBP',
  'KOMPOL',
  'AKP',
  'IPTU',
  'IPDA',
  'AIPTU',
  'AIPDA',
  'BRIPKA',
  'BRIGPOL',
  'BRIGADIR',
  'BRIGADIR POLISI',
  'BRIPTU',
  'BRIPDA',
];

function rankWeight(rank) {
  const idx = RANK_ORDER.indexOf(String(rank || '').toUpperCase());
  return idx === -1 ? RANK_ORDER.length : idx;
}

export async function saveWeeklyLikesRecapExcel(clientId) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  let weekStart;
  let weekEnd;

  if (dayOfWeek === 0) {
    weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 6);
    weekEnd = today;
  } else {
    weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() - dayOfWeek);
    weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
  }

  const formatIso = (d) => d.toISOString().slice(0, 10);
  const formatDisplay = (d) =>
    new Date(d).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const dateList = [];
  for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
    dateList.push(formatIso(d));
  }

  const grouped = {};
  const dailyPosts = {};

  const results = await Promise.all(
    dateList.map(async (dateStr) => {
      const { rows, totalKonten } = await getRekapLikesByClient(
        clientId,
        'harian',
        dateStr,
        undefined,
        undefined,
        'ditbinmas'
      );
      return { dateStr, rows, totalKonten };
    })
  );

  const resultMap = results.reduce((acc, { dateStr, rows, totalKonten }) => {
    acc[dateStr] = { rows, totalKonten };
    return acc;
  }, {});

  dateList.forEach((dateStr) => {
    const { rows = [], totalKonten = 0 } = resultMap[dateStr] || {};
    dailyPosts[dateStr] = totalKonten;
    for (const u of rows) {
      const satker = u.client_name || '';
      if (!grouped[satker]) grouped[satker] = {};
      const key = `${u.title || ''}|${u.nama || ''}`;
      if (!grouped[satker][key]) {
        grouped[satker][key] = {
          pangkat: u.title || '',
          nama: u.nama || '',
          satfung: u.divisi || '',
          perDate: {},
          totalLikes: 0,
        };
      }
      grouped[satker][key].perDate[dateStr] = { likes: u.jumlah_like || 0 };
      grouped[satker][key].totalLikes += u.jumlah_like || 0;
    }
  });

  const wb = XLSX.utils.book_new();
  Object.entries(grouped).forEach(([satker, usersMap]) => {
    const users = Object.values(usersMap);
    users.sort((a, b) => {
      if (b.totalLikes !== a.totalLikes) return b.totalLikes - a.totalLikes;
      const rankA = rankWeight(a.pangkat);
      const rankB = rankWeight(b.pangkat);
      if (rankA !== rankB) return rankA - rankB;
      return a.nama.localeCompare(b.nama);
    });

    const aoa = [];
    const colCount = 4 + dateList.length * 3;
    const title = `${satker} – Rekap Engagement Instagram`;
    const periodStr = `${formatDisplay(weekStart)} - ${formatDisplay(weekEnd)}`;
    const subtitle = `Rekap Likes Instagram Periode ${periodStr}`;
    aoa.push([title]);
    aoa.push([subtitle]);

    const headerDates = ['No', 'Pangkat', 'Nama', 'Divisi / Satfung'];
    const subHeader = ['', '', '', ''];
    dateList.forEach((d) => {
      const disp = formatDisplay(d);
      headerDates.push(disp, '', '');
      subHeader.push('Jumlah Post', 'Sudah Likes', 'Belum Likes');
    });
    aoa.push(headerDates);
    aoa.push(subHeader);

    users.forEach((u, idx) => {
      const row = [idx + 1, u.pangkat || '', u.nama || '', u.satfung || ''];
      dateList.forEach((d) => {
        const likes = u.perDate[d]?.likes || 0;
        const posts = dailyPosts[d] || 0;
        row.push(posts, likes, Math.max(posts - likes, 0));
      });
      aoa.push(row);
    });

    const summaryRow = ['TOTAL', '', '', ''];
    const startRow = 5; // 1-indexed data start row
    const endRow = 4 + users.length;
    dateList.forEach((_, i) => {
      const postsCol = XLSX.utils.encode_col(4 + i * 3);
      const sudahCol = XLSX.utils.encode_col(4 + i * 3 + 1);
      const belumCol = XLSX.utils.encode_col(4 + i * 3 + 2);
      summaryRow.push(
        { f: `SUM(${postsCol}${startRow}:${postsCol}${endRow})` },
        { f: `SUM(${sudahCol}${startRow}:${sudahCol}${endRow})` },
        { f: `SUM(${belumCol}${startRow}:${belumCol}${endRow})` }
      );
    });
    aoa.push(summaryRow);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
    ];
    dateList.forEach((_, i) => {
      merges.push({
        s: { r: 2, c: 4 + i * 3 },
        e: { r: 2, c: 4 + i * 3 + 2 },
      });
    });
    ws['!merges'] = merges;

    ws['!freeze'] = { xSplit: 4, ySplit: 4 };

    const lastDataRow = 4 + users.length;
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({ r: 3, c: 0 }, { r: lastDataRow - 1, c: colCount - 1 }),
    };

    const green = { patternType: 'solid', fgColor: { rgb: 'C6EFCE' } };
    const red = { patternType: 'solid', fgColor: { rgb: 'F8CBAD' } };
    for (let r = 4; r <= lastDataRow; r++) {
      dateList.forEach((_, i) => {
        const sudahCell = XLSX.utils.encode_cell({ r, c: 4 + i * 3 + 1 });
        const belumCell = XLSX.utils.encode_cell({ r, c: 4 + i * 3 + 2 });
        if (ws[sudahCell]) ws[sudahCell].s = { fill: green };
        if (ws[belumCell]) ws[belumCell].s = { fill: red };
      });
    }

    XLSX.utils.book_append_sheet(wb, ws, satker);
  });

  const exportDir = path.resolve('export_data/weekly_likes');
  await mkdir(exportDir, { recursive: true });

  const fileDate = new Date(dateList[dateList.length - 1]);
  const now = new Date();
  const hari = hariIndo[fileDate.getDay()];
  const tanggal = fileDate.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });
  const dateSafe = tanggal.replace(/\//g, '-');
  const timeSafe = jam.replace(/[:.]/g, '-');
  const formattedClient = (clientId || '')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
  const filePath = path.join(
    exportDir,
    `Rekap_Mingguan_Instagram_${formattedClient}_${hari}_${dateSafe}_${timeSafe}.xlsx`
  );
  XLSX.writeFile(wb, filePath, { cellStyles: true });
  return filePath;
}

