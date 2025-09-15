import { jest } from '@jest/globals';
import { unlink } from 'fs/promises';
import XLSX from 'xlsx';

process.env.TZ = 'Asia/Jakarta';

const mockGetRekapLikesByClient = jest.fn();

jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getRekapLikesByClient: mockGetRekapLikesByClient,
}));

const { saveWeeklyLikesRecapExcel } = await import(
  '../src/service/weeklyLikesRecapExcelService.js'
);

test('saveWeeklyLikesRecapExcel creates recap with per-date columns', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-07T00:00:00Z'));

  mockGetRekapLikesByClient.mockImplementation(async (clientId, periode, tanggal) => {
    if (tanggal === '2024-04-07') {
      return {
        rows: [
          {
            client_name: 'POLRES A',
            title: 'AKP',
            nama: 'Budi',
            divisi: 'Sat A',
            jumlah_like: 2,
          },
        ],
        totalKonten: 3,
      };
    }
    return { rows: [], totalKonten: 0 };
  });

  const filePath = await saveWeeklyLikesRecapExcel('DITBINMAS');
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['POLRES A'];
  const rows = XLSX.utils.sheet_to_json(sheet);

  expect(rows[0]).toMatchObject({
    'Pangkat Nama': 'AKP Budi',
    'Divisi / Satfung': 'Sat A',
    '2024-04-07 Jumlah Post': 3,
    '2024-04-07 Sudah Likes': 2,
    '2024-04-07 Belum Likes': 1,
  });

  await unlink(filePath);
  jest.useRealTimers();
});

