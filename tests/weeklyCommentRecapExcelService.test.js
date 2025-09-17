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

const { saveWeeklyCommentRecapExcel } = await import(
  '../src/service/weeklyCommentRecapExcelService.js'
);

beforeEach(() => {
  jest.useRealTimers();
  mockGetRekapKomentarByClient.mockReset();
  mockCountPostsByClient.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

test('saveWeeklyCommentRecapExcel creates formatted weekly recap', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-07T00:00:00Z'));

  mockGetRekapKomentarByClient.mockImplementation(async (clientId, periode, tanggal) => {
    if (tanggal === '2024-04-07') {
      return [
        {
          client_name: 'POLRES A',
          title: 'AKP',
          nama: 'Budi',
          divisi: 'Sat A',
          jumlah_komentar: 2,
        },
      ];
    }
    return [];
  });
  mockCountPostsByClient.mockImplementation(async (clientId, periode, tanggal) => {
    if (tanggal === '2024-04-07') return 3;
    return 0;
  });

  const filePath = await saveWeeklyCommentRecapExcel('DITBINMAS');
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['POLRES A'];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  expect(aoa[0][0]).toBe('POLRES A – Rekap Engagement Tiktok');
  expect(aoa[1][0]).toBe(
    'Rekap Komentar Tiktok Periode 01/04/2024 - 07/04/2024'
  );
  expect(aoa[2].slice(0, 4)).toEqual([
    'No',
    'Pangkat',
    'Nama',
    'Divisi / Satfung',
  ]);
  expect(aoa[3].slice(4, 7)).toEqual([
    'Jumlah Post',
    'Sudah Komentar',
    'Belum Komentar',
  ]);
  const lastIdx = aoa[2].length - 3;
  expect(aoa[4].slice(0, 4)).toEqual([1, 'AKP', 'Budi', 'Sat A']);
  expect(aoa[4].slice(lastIdx, lastIdx + 3)).toEqual([3, 2, 1]);

  expect(mockGetRekapKomentarByClient).toHaveBeenCalled();
  mockGetRekapKomentarByClient.mock.calls.forEach((call) => {
    expect(call[5]).toBe('ditbinmas');
  });

  await unlink(filePath);
});

test('saveWeeklyCommentRecapExcel includes non-ditbinmas clients without role filter', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-07T00:00:00Z'));

  mockGetRekapKomentarByClient.mockImplementation(async (clientId, periode, tanggal) => {
    if (tanggal === '2024-04-05') {
      return [
        {
          client_name: 'POLRES B',
          title: 'IPTU',
          nama: 'Siti',
          divisi: 'Sat B',
          jumlah_komentar: 1,
        },
      ];
    }
    return [];
  });
  mockCountPostsByClient.mockImplementation(async (clientId, periode, tanggal) => {
    if (tanggal === '2024-04-05') return 2;
    return 0;
  });

  const filePath = await saveWeeklyCommentRecapExcel('POLRES123');
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['POLRES B'];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  expect(sheet).toBeDefined();
  expect(aoa[4].slice(0, 4)).toEqual([1, 'IPTU', 'Siti', 'Sat B']);

  expect(mockGetRekapKomentarByClient).toHaveBeenCalled();
  mockGetRekapKomentarByClient.mock.calls.forEach((call) => {
    expect(call[5]).toBeUndefined();
  });

  await unlink(filePath);
});
