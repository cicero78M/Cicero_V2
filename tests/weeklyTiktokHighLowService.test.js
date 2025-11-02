import { jest } from '@jest/globals';

process.env.TZ = 'Asia/Jakarta';
process.env.JWT_SECRET = 'testsecret';

const mockGetRekapKomentarByClient = jest.fn();
const mockCountPostsByClient = jest.fn();

jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getRekapKomentarByClient: mockGetRekapKomentarByClient,
}));

jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  countPostsByClient: mockCountPostsByClient,
}));

jest.unstable_mockModule('../src/utils/utilsHelper.js', () => ({
  formatNama: ({ title, nama }) => [title, nama].filter(Boolean).join(' ').trim(),
}));

let generateWeeklyTiktokHighLowReport;

beforeAll(async () => {
  ({ generateWeeklyTiktokHighLowReport } = await import(
    '../src/service/weeklyTiktokHighLowService.js'
  ));
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2024-07-10T03:00:00.000Z'));
  mockCountPostsByClient.mockResolvedValue(12);
});

afterEach(() => {
  jest.useRealTimers();
});

test('generateWeeklyTiktokHighLowReport returns formatted recap with top and bottom performers', async () => {
  mockGetRekapKomentarByClient.mockResolvedValue([
    {
      user_id: '1',
      title: 'AKP',
      nama: 'Budi',
      divisi: 'Sat Binmas',
      client_id: 'POLRES_A',
      client_name: 'Polres A',
      jumlah_komentar: 10,
    },
    {
      user_id: '2',
      title: 'IPTU',
      nama: 'Ani',
      divisi: 'Sat Lantas',
      client_id: 'POLRES_A',
      client_name: 'Polres A',
      jumlah_komentar: 8,
    },
    {
      user_id: '3',
      title: 'IPDA',
      nama: 'Candra',
      divisi: 'Sat Intelkam',
      client_id: 'POLRES_B',
      client_name: 'Polres B',
      jumlah_komentar: 5,
    },
    {
      user_id: '4',
      title: 'AIPTU',
      nama: 'Dedi',
      divisi: 'Sat Samapta',
      client_id: 'POLRES_B',
      client_name: 'Polres B',
      jumlah_komentar: 3,
    },
    {
      user_id: '5',
      title: 'BRIPKA',
      nama: 'Eko',
      divisi: 'Sat Reskrim',
      client_id: 'POLRES_C',
      client_name: 'Polres C',
      jumlah_komentar: 1,
    },
    {
      user_id: '6',
      title: 'BRIPTU',
      nama: 'Fajar',
      divisi: 'Sat Sabhara',
      client_id: 'POLRES_D',
      client_name: 'Polres D',
      jumlah_komentar: 0,
    },
  ]);

  const message = await generateWeeklyTiktokHighLowReport('DITBINMAS', {
    roleFlag: 'ditbinmas',
  });

  expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'harian',
    undefined,
    '2024-07-01',
    '2024-07-07',
    'ditbinmas'
  );
  expect(mockCountPostsByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'harian',
    undefined,
    '2024-07-01',
    '2024-07-07',
    'ditbinmas'
  );
  expect(message).toContain('📊 *Laporan TikTok High & Low*');
  expect(message).toContain('Periode: Senin, 01 Juli 2024 s.d. Minggu, 07 Juli 2024');
  expect(message).toContain('Total tugas TikTok: 12');
  expect(message).toContain('🔥 *5 Pelaksana Tertinggi*');
  expect(message).toContain('1. AKP Budi (Sat Binmas • Polres A) — 10 tugas');
  expect(message).toContain('❄️ *5 Pelaksana Terendah*');
  expect(message).toContain('1. BRIPTU Fajar (Sat Sabhara • Polres D) — 0 tugas');
});

test('generateWeeklyTiktokHighLowReport returns no data message when participants empty', async () => {
  mockGetRekapKomentarByClient.mockResolvedValue([]);
  mockCountPostsByClient.mockResolvedValue(0);

  const message = await generateWeeklyTiktokHighLowReport('DITBINMAS', {
    roleFlag: 'ditbinmas',
  });

  expect(message).toContain('📊 *Laporan TikTok High & Low*');
  expect(message).toContain('Total tugas TikTok: 0');
  expect(message).toContain(
    'Tidak ada data pelaksanaan komentar TikTok pada periode tersebut.'
  );
});

test('generateWeeklyTiktokHighLowReport throws when clientId missing', async () => {
  await expect(generateWeeklyTiktokHighLowReport('')).rejects.toThrow(
    /clientId wajib diisi/i
  );
  expect(mockGetRekapKomentarByClient).not.toHaveBeenCalled();
  expect(mockCountPostsByClient).not.toHaveBeenCalled();
});

test('generateWeeklyTiktokHighLowReport rejects non-DITBINMAS access', async () => {
  await expect(
    generateWeeklyTiktokHighLowReport('POLRES_X', { roleFlag: 'operator' })
  ).rejects.toThrow(/DITBINMAS/);
  await expect(
    generateWeeklyTiktokHighLowReport('DITBINMAS', { roleFlag: 'operator' })
  ).rejects.toThrow(/DITBINMAS/);
  expect(mockGetRekapKomentarByClient).not.toHaveBeenCalled();
  expect(mockCountPostsByClient).not.toHaveBeenCalled();
});
