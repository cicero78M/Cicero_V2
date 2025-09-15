import { mkdir } from 'fs/promises';
import path from 'path';
import XLSX from 'xlsx';
import { hariIndo } from '../utils/constants.js';

export async function saveLikesRecapExcel(data, clientId) {
  const { shortcodes, recap } = data;
  const wb = XLSX.utils.book_new();
  const recapDate = new Date().toLocaleDateString('id-ID');

  Object.entries(recap).forEach(([polres, users]) => {
    const header = [
      'Pangkat Nama',
      'Divisi / Satfung',
      `${recapDate} Jumlah Post`,
      `${recapDate} Sudah Likes`,
      `${recapDate} Belum Likes`,
    ];

    const rows = users.map((u) => {
      const totalPost = shortcodes.length;
      const likedCount = shortcodes.reduce(
        (sum, sc) => sum + (u[sc] ?? 0),
        0
      );
      return {
        'Pangkat Nama': `${u.pangkat ? u.pangkat + ' ' : ''}${u.nama}`.trim(),
        'Divisi / Satfung': u.satfung || '',
        [`${recapDate} Jumlah Post`]: totalPost,
        [`${recapDate} Sudah Likes`]: likedCount,
        [`${recapDate} Belum Likes`]: totalPost - likedCount,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows, { header });
    XLSX.utils.book_append_sheet(wb, ws, polres);
  });

  const exportDir = path.resolve('export_data/likes_recap');
  await mkdir(exportDir, { recursive: true });

  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggalStr = now.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });
  const dateSafe = tanggalStr.replace(/\//g, '-');
  const timeSafe = jam.replace(/[:.]/g, '-');
  const formattedClient = (clientId || '')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
  const filePath = path.join(
    exportDir,
    `Rekap_Engagement_Instagram_${formattedClient}_${hari}_${dateSafe}_${timeSafe}.xlsx`
  );
  XLSX.writeFile(wb, filePath);
  return filePath;
}
