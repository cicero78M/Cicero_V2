import { jest } from '@jest/globals';
import { unlink } from 'fs/promises';
import XLSX from 'xlsx';

process.env.TZ = 'Asia/Jakarta';

const mockGetRekapLikesByClient = jest.fn();

jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getRekapLikesByClient: mockGetRekapLikesByClient,
}));

const { saveMonthlyLikesRecapExcel } = await import(
  '../src/service/monthlyLikesRecapExcelService.js'
);

test('saveMonthlyLikesRecapExcel creates formatted monthly recap', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-15T00:00:00Z'));
  mockGetRekapLikesByClient.mockReset();
  mockGetRekapLikesByClient.mockImplementation(async () => ({
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
  }));

  const filePath = await saveMonthlyLikesRecapExcel('DITBINMAS');
  expect(filePath).toBeTruthy();
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['POLRES A'];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  expect(aoa[0][0]).toBe('POLRES A – Rekap Engagement Instagram');
  expect(aoa[1][0]).toBe(
    'Rekap Likes Instagram Periode 01/04/2024 - 15/04/2024'
  );
  expect(aoa[2].slice(0, 4)).toEqual([
    'No',
    'Pangkat',
    'Nama',
    'Divisi / Satfung',
  ]);
  const lastIdx = aoa[2].length - 3;
  expect(aoa[3].slice(lastIdx, lastIdx + 3)).toEqual([
    'Jumlah Post',
    'Sudah Likes',
    'Belum Likes',
  ]);
  expect(aoa[4].slice(0, 4)).toEqual([1, 'AKP', 'Budi', 'Sat A']);
  expect(aoa[4].slice(lastIdx, lastIdx + 3)).toEqual([3, 2, 1]);

  await unlink(filePath);
  jest.useRealTimers();
});

test('saveMonthlyLikesRecapExcel returns null when no data', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-15T00:00:00Z'));
  mockGetRekapLikesByClient.mockReset();
  mockGetRekapLikesByClient.mockResolvedValue({ rows: [], totalKonten: 0 });

  const filePath = await saveMonthlyLikesRecapExcel('DITBINMAS');
  expect(filePath).toBeNull();
  jest.useRealTimers();
});
