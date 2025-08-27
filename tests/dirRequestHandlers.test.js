import { jest } from '@jest/globals';

process.env.TZ = 'Asia/Jakarta';

const mockGetUsersSocialByClient = jest.fn();
const mockGetClientsByRole = jest.fn();
const mockAbsensiLink = jest.fn();
const mockAbsensiLikes = jest.fn();
const mockAbsensiKomentar = jest.fn();
const mockFindClientById = jest.fn();

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersSocialByClient: mockGetUsersSocialByClient,
  getClientsByRole: mockGetClientsByRole,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/link/absensiLinkAmplifikasi.js', () => ({
  absensiLink: mockAbsensiLink,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/insta/absensiLikesInsta.js', () => ({
  absensiLikes: mockAbsensiLikes,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js', () => ({
  absensiKomentar: mockAbsensiKomentar,
}));
jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));
jest.unstable_mockModule('../src/utils/utilsHelper.js', () => ({
  getGreeting: () => 'Selamat malam',
  sortDivisionKeys: (arr) => arr.sort(),
  formatNama: (u) => `${u.title || ''} ${u.nama || ''}`.trim(),
}));

let dirRequestHandlers;
beforeAll(async () => {
  ({ dirRequestHandlers } = await import('../src/handler/menu/dirRequestHandlers.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('choose_menu aggregates directorate data by client_id', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-08-27T16:06:00Z'));

  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'ditbinmas', insta: null, tiktok: null },
    { client_id: 'polres_pasuruan_kota', insta: null, tiktok: null },
  ]);
  mockGetClientsByRole.mockResolvedValue([
    'polres_pasuruan_kota',
    'polres_sidoarjo',
  ]);
  mockFindClientById.mockImplementation(async (cid) => ({
    ditbinmas: { nama: 'DIT BINMAS', client_type: 'direktorat' },
    polres_pasuruan_kota: { nama: 'POLRES PASURUAN KOTA', client_type: 'org' },
    polres_sidoarjo: { nama: 'POLRES SIDOARJO', client_type: 'org' },
  })[cid]);

  const session = {
    role: 'ditbinmas',
    selectedClientId: 'polres_pasuruan_kota',
    clientName: 'POLRES PASURUAN KOTA',
    dir_client_id: 'ditbinmas',
  };
  const chatId = '123';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '1', waClient);

  expect(mockGetUsersSocialByClient).toHaveBeenCalledWith('ditbinmas', 'ditbinmas');
  expect(mockGetClientsByRole).toHaveBeenCalledWith('ditbinmas');
  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toContain('DIT BINMAS');
  expect(msg).toContain('POLRES PASURUAN KOTA');
  expect(msg).toContain('POLRES SIDOARJO');
  expect(msg).not.toMatch(/POLRES SIDOARJO\n\nJumlah User/);
  jest.useRealTimers();
});
