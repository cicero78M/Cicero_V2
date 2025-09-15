import { unlink } from 'fs/promises';
import XLSX from 'xlsx';
import { saveLikesRecapExcel } from '../src/service/likesRecapExcelService.js';

test('saveLikesRecapExcel creates recap with date columns', async () => {
  const data = {
    shortcodes: ['SC1', 'SC2'],
    recap: {
      'POLRES A': [
        { pangkat: 'AKP', nama: 'Budi', satfung: 'Sat A', SC1: 1, SC2: 0 },
      ],
    },
  };

  const filePath = await saveLikesRecapExcel(data, 'DITBINMAS');
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['POLRES A'];
  const rows = XLSX.utils.sheet_to_json(sheet);
  const recapDate = new Date().toLocaleDateString('id-ID');

  expect(rows[0]).toEqual({
    'Pangkat Nama': 'AKP Budi',
    'Divisi / Satfung': 'Sat A',
    [`${recapDate} Jumlah Post`]: 2,
    [`${recapDate} Sudah Likes`]: 1,
    [`${recapDate} Belum Likes`]: 1,
  });

  await unlink(filePath);
});
