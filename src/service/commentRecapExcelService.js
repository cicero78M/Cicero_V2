import { mkdir } from 'fs/promises';
import path from 'path';
import XLSX from 'xlsx';
import { hariIndo } from '../utils/constants.js';

export async function saveCommentRecapExcel(data, clientId) {
  const { videoIds, recap } = data;
  const wb = XLSX.utils.book_new();
  Object.entries(recap).forEach(([polres, users]) => {
    const header = ['Pangkat Nama', 'Satfung', ...videoIds];
    const rows = users.map((u) => {
      const row = {
        'Pangkat Nama': `${u.pangkat ? u.pangkat + ' ' : ''}${u.nama}`.trim(),
        Satfung: u.satfung || '',
      };
      videoIds.forEach((vid) => {
        row[vid] = u[vid] ?? 0;
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows, { header });
    XLSX.utils.book_append_sheet(wb, ws, polres);
  });
  const exportDir = path.resolve('export_data/comment_recap');
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
    `Rekap_Engagement_Tiktok_${formattedClient}_${hari}_${dateSafe}_${timeSafe}.xlsx`
  );
  XLSX.writeFile(wb, filePath);
  return filePath;
}

export default saveCommentRecapExcel;

