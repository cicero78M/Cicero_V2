import { jest } from '@jest/globals';

const mockGetUsersByClient = jest.fn();
const mockGetRekapKomentarByClient = jest.fn();

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: mockGetUsersByClient,
}));

jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getRekapKomentarByClient: mockGetRekapKomentarByClient,
}));

let generateKasatBinmasTiktokCommentRecap;

beforeAll(async () => {
  ({ generateKasatBinmasTiktokCommentRecap } = await import(
    '../src/service/kasatBinmasTiktokCommentRecapService.js'
  ));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('menyusun ringkasan absensi komentar TikTok untuk Kasat Binmas', async () => {
  mockGetUsersByClient.mockResolvedValue([
    {
      user_id: '1',
      nama: 'Alpha',
      title: 'AKP',
      jabatan: 'Kasat Binmas Polres A',
      client_id: 'POLRESA',
      client_name: 'Polres A',
      tiktok: '@alpha',
    },
    {
      user_id: '2',
      nama: 'Bravo',
      title: 'IPTU',
      jabatan: 'Kasat Binmas Polres B',
      client_id: 'POLRESB',
      client_name: 'Polres B',
      tiktok: '',
    },
    {
      user_id: '4',
      nama: 'Delta',
      title: 'AKP',
      jabatan: 'WA Kasat Binmas',
      client_id: 'POLRESD',
      client_name: 'Polres D',
      tiktok: '@delta',
    },
    {
      user_id: '3',
      nama: 'Charlie',
      title: 'AKP',
      jabatan: 'Kasat Intel',
      client_id: 'POLRESC',
      client_name: 'Polres C',
      tiktok: '@charlie',
    },
  ]);
  mockGetRekapKomentarByClient.mockResolvedValue([
    { user_id: '1', jumlah_komentar: 3, total_konten: 3 },
    { user_id: '2', jumlah_komentar: 0, total_konten: 3 },
  ]);

  const summary = await generateKasatBinmasTiktokCommentRecap({ period: 'daily' });

  expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'harian',
    expect.any(String),
    undefined,
    undefined,
    'ditbinmas'
  );
  expect(summary).toContain('📋 *Absensi Komentar TikTok Kasat Binmas*');
  expect(summary).toContain('Total konten periode: 3 video');
  expect(summary).toContain('Total Kasat Binmas: 2 pers');
  expect(summary).toContain('Lengkap: 1/2 pers');
  expect(summary).toContain('Sebagian: 0/2 pers');
  expect(summary).toContain('Belum komentar: 0/2 pers');
  expect(summary).toContain('Belum update akun TikTok: 1 pers');
  expect(summary).toMatch(/Alpha/);
  expect(summary).not.toMatch(/Charlie/);
  expect(summary).not.toMatch(/Delta/);
});

test('periode harian memakai tanggal WIB agar tidak bergeser oleh zona waktu server', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-03-01T18:30:00.000Z'));
  mockGetUsersByClient.mockResolvedValue([
    {
      user_id: '10',
      nama: 'Zulu',
      title: 'AKP',
      jabatan: 'Kasat Binmas',
      client_id: 'POLREZ',
      client_name: 'Polres Z',
      tiktok: '@zulu',
    },
  ]);
  mockGetRekapKomentarByClient.mockResolvedValue([
    { user_id: '10', jumlah_komentar: 1, total_konten: 1 },
  ]);

  try {
    const summary = await generateKasatBinmasTiktokCommentRecap({ period: 'daily' });

    expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
      'DITBINMAS',
      'harian',
      '2024-03-02',
      undefined,
      undefined,
      'ditbinmas'
    );
    expect(summary).toContain('02 Maret 2024');
  } finally {
    jest.useRealTimers();
  }
});

test('mengembalikan pesan ketika tidak ada Kasat Binmas', async () => {
  mockGetUsersByClient.mockResolvedValue([
    { user_id: '1', jabatan: 'Operator', tiktok: '@alpha' },
  ]);

  const summary = await generateKasatBinmasTiktokCommentRecap();

  expect(summary).toContain('tidak ditemukan data Kasat Binmas');
  expect(mockGetRekapKomentarByClient).not.toHaveBeenCalled();
});

test('mengirim parameter minggu Senin-Minggu untuk period weekly', async () => {
  mockGetUsersByClient.mockResolvedValue([
    {
      user_id: '1',
      jabatan: 'Kasat Binmas',
      nama: 'Alpha',
      title: 'AKP',
      client_id: 'POLRESA',
      client_name: 'Polres A',
      tiktok: '@alpha',
    },
  ]);
  mockGetRekapKomentarByClient.mockResolvedValue([
    { user_id: '1', jumlah_komentar: 1, total_konten: 1 },
  ]);

  const summary = await generateKasatBinmasTiktokCommentRecap({ period: 'weekly' });

  expect(summary).toContain('Periode:');
  expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'mingguan',
    expect.any(String),
    expect.any(String),
    expect.any(String),
    'ditbinmas'
  );
});
