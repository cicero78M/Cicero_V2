import { jest } from '@jest/globals';
import { unlink } from 'fs/promises';
import XLSX from 'xlsx';

process.env.TZ = 'Asia/Jakarta';

const mockGetRekapKomentarByClient = jest.fn();
const mockCountPostsByClient = jest.fn();

jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getRekapKomentarByClient: mockGetRekapKomentarByClient,
}));

jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  countPostsByClient: mockCountPostsByClient,
}));

const { saveMonthlyCommentRecapExcel } = await import(
  '../src/service/monthlyCommentRecapExcelService.js'
);

test('saveMonthlyCommentRecapExcel creates formatted monthly recap', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-15T00:00:00Z'));

  mockGetRekapKomentarByClient.mockReset();
  mockCountPostsByClient.mockReset();
  mockGetRekapKomentarByClient.mockImplementation(async () => [
    {
      client_name: 'POLRES A',
      title: 'AKP',
      nama: 'Budi',
      divisi: 'Sat A',
      jumlah_komentar: 2,
    },
  ]);
  mockCountPostsByClient.mockResolvedValue(3);

  const filePath = await saveMonthlyCommentRecapExcel('DITBINMAS');
  expect(filePath).toBeTruthy();
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['POLRES A'];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  expect(aoa[0][0]).toBe('POLRES A – Rekap Engagement Tiktok');
  expect(aoa[1][0]).toBe(
    'Rekap Komentar Tiktok Periode 01/04/2024 - 15/04/2024'
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
    'Sudah Komentar',
    'Belum Komentar',
  ]);
  expect(aoa[4].slice(0, 4)).toEqual([1, 'AKP', 'Budi', 'Sat A']);
  expect(aoa[4].slice(lastIdx, lastIdx + 3)).toEqual([3, 2, 1]);

  await unlink(filePath);
  jest.useRealTimers();
});

test('saveMonthlyCommentRecapExcel returns null when no data', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-15T00:00:00Z'));
  mockGetRekapKomentarByClient.mockReset();
  mockCountPostsByClient.mockReset();
  mockGetRekapKomentarByClient.mockResolvedValue([]);
  mockCountPostsByClient.mockResolvedValue(0);

  const filePath = await saveMonthlyCommentRecapExcel('DITBINMAS');
  expect(filePath).toBeNull();
  jest.useRealTimers();
});
