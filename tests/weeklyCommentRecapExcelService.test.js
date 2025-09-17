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
          client_id: 'POLRESA',
          title: 'AKP',
          nama: 'Budi',
          divisi: 'Sat A',
          jumlah_komentar: 2,
        },
        {
          client_name: 'POLRES B',
          client_id: 'POLRESB',
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
    if (clientId === 'POLRESA' && tanggal === '2024-04-07') return 4;
    if (clientId === 'POLRESB' && tanggal === '2024-04-07') return 3;
    return 0;
  });

  const filePath = await saveWeeklyCommentRecapExcel('DITBINMAS');
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['POLRES A'];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  expect(wb.SheetNames.length).toBeGreaterThan(1);
  expect(wb.SheetNames).toEqual(
    expect.arrayContaining(['POLRES A', 'POLRES B'])
  );
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
    'Sudah Likes',
    'Belum Likes',
  ]);
  const lastIdx = aoa[2].length - 3;
  expect(aoa[4].slice(0, 4)).toEqual([1, 'AKP', 'Budi', 'Sat A']);
  expect(aoa[4].slice(lastIdx, lastIdx + 3)).toEqual([4, 2, 2]);

  expect(mockGetRekapKomentarByClient).toHaveBeenCalled();
  mockGetRekapKomentarByClient.mock.calls.forEach((call) => {
    expect(call[5]).toBe('ditbinmas');
  });

  const calledIds = new Set(mockCountPostsByClient.mock.calls.map((call) => call[0]));
  expect(calledIds).toEqual(new Set(['POLRESA', 'POLRESB']));

  await unlink(filePath);
});

test('saveWeeklyCommentRecapExcel splits Ditbinmas recap per satker sheet', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-07T00:00:00Z'));

  const recapRows = [
    {
      client_name: 'POLRES A',
      client_id: 'POLRESA',
      title: 'AKP',
      nama: 'Budi',
      divisi: 'Sat A',
      jumlah_komentar: 2,
    },
    {
      client_name: 'POLRES B',
      client_id: 'POLRESB',
      title: 'IPTU',
      nama: 'Siti',
      divisi: 'Sat B',
      jumlah_komentar: 1,
    },
    {
      client_name: 'POLRES C',
      client_id: 'POLRESC',
      title: 'IPDA',
      nama: 'Tono',
      divisi: 'Sat C',
      jumlah_komentar: 3,
    },
  ];

  mockGetRekapKomentarByClient.mockImplementation(async (clientId, periode, tanggal) => {
    if (tanggal === '2024-04-07') return recapRows;
    return [];
  });
  mockCountPostsByClient.mockImplementation(async (clientId, periode, tanggal) => {
    if (tanggal === '2024-04-07') {
      if (clientId === 'POLRESA') return 5;
      if (clientId === 'POLRESB') return 4;
      if (clientId === 'POLRESC') return 6;
    }
    return 0;
  });

  const filePath = await saveWeeklyCommentRecapExcel('DITBINMAS');
  const wb = XLSX.readFile(filePath);
  const sheetNames = [...wb.SheetNames].sort();
  const expectedNames = ['POLRES A', 'POLRES B', 'POLRES C'];
  expect(sheetNames).toEqual(expectedNames);

  expectedNames.forEach((name) => {
    const sheet = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    expect(aoa[0][0]).toContain(name);
  });

  mockGetRekapKomentarByClient.mock.calls.forEach((call) => {
    expect(call[5]).toBe('ditbinmas');
  });

  await unlink(filePath);
});

test('saveWeeklyCommentRecapExcel creates sheet when satker users lack TikTok usernames', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-07T00:00:00Z'));

  const recapRows = [
    {
      client_name: 'POLRES TANPA HANDLE',
      client_id: 'POLRESTH',
      title: 'AKP',
      nama: 'Anonim',
      divisi: 'Sat Tanpa',
      jumlah_komentar: 0,
      username: null,
    },
  ];

  mockGetRekapKomentarByClient.mockImplementation(async (clientId, periode, tanggal) => {
    if (tanggal === '2024-04-07') return recapRows;
    return [];
  });
  mockCountPostsByClient.mockImplementation(async (clientId, periode, tanggal) => {
    if (clientId === 'POLRESTH' && tanggal === '2024-04-07') return 4;
    return 0;
  });

  const filePath = await saveWeeklyCommentRecapExcel('DITBINMAS');
  const wb = XLSX.readFile(filePath);

  expect(wb.SheetNames).toContain('POLRES TANPA HANDLE');
  const sheet = wb.Sheets['POLRES TANPA HANDLE'];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  expect(aoa[0][0]).toContain('POLRES TANPA HANDLE');
  expect(aoa[4].slice(0, 4)).toEqual([1, 'AKP', 'Anonim', 'Sat Tanpa']);

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
          client_id: 'POLRESB',
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
    if (clientId === 'POLRESB' && tanggal === '2024-04-05') return 2;
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
