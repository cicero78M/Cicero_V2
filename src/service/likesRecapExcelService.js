import { mkdir } from 'fs/promises';
import path from 'path';
import XLSX from 'xlsx';

export async function saveLikesRecapExcel(data) {
  const { shortcodes, recap } = data;
  const wb = XLSX.utils.book_new();
  Object.entries(recap).forEach(([polres, users]) => {
    const header = ['Pangkat Nama', 'Satfung', ...shortcodes];
    const rows = users.map((u) => {
      const row = {
        'Pangkat Nama': `${u.pangkat ? u.pangkat + ' ' : ''}${u.nama}`.trim(),
        Satfung: u.satfung || '',
      };
      shortcodes.forEach((sc) => {
        row[sc] = u[sc] ?? 0;
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows, { header });
    XLSX.utils.book_append_sheet(wb, ws, polres);
  });
  const exportDir = path.resolve('export_data/likes_recap');
  await mkdir(exportDir, { recursive: true });
  const filePath = path.join(
    exportDir,
    `likes_recap_${Date.now()}.xlsx`
  );
  XLSX.writeFile(wb, filePath);
  return filePath;
}
