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
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 6);
  const formatDate = (d) => d.toISOString().slice(0, 10);

  const dateList = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dateList.push(formatDate(d));
  }

  const grouped = {};
  const dailyPosts = {};

  for (const dateStr of dateList) {
    const { rows, totalKonten } = await getRekapLikesByClient(
      clientId,
      'harian',
      dateStr,
      undefined,
      undefined,
      'ditbinmas'
    );
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
      grouped[satker][key].perDate[dateStr] = {
        likes: u.jumlah_like || 0,
      };
      grouped[satker][key].totalLikes += u.jumlah_like || 0;
    }
  }

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
    const header = ['Pangkat Nama', 'Satfung'];
    dateList.forEach((d) => {
      header.push(`${d} Jumlah Post Tugas`);
      header.push(`${d} Sudah Likes`);
      header.push(`${d} Belum Likes`);
    });
    const rowsData = users.map((u) => {
      const row = {
        'Pangkat Nama': `${u.pangkat ? u.pangkat + ' ' : ''}${u.nama}`.trim(),
        Satfung: u.satfung || '',
      };
      dateList.forEach((d) => {
        const likes = u.perDate[d]?.likes || 0;
        const posts = dailyPosts[d] || 0;
        row[`${d} Jumlah Post Tugas`] = posts;
        row[`${d} Sudah Likes`] = likes;
        row[`${d} Belum Likes`] = Math.max(posts - likes, 0);
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rowsData, { header });
    XLSX.utils.book_append_sheet(wb, ws, satker);
  });

  const exportDir = path.resolve('export_data/weekly_likes');
  await mkdir(exportDir, { recursive: true });

  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString('id-ID');
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
  XLSX.writeFile(wb, filePath);
  return filePath;
}

