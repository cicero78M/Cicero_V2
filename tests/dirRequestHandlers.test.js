import { jest } from '@jest/globals';

process.env.TZ = 'Asia/Jakarta';

const mockGetUsersSocialByClient = jest.fn();
const mockGetClientsByRole = jest.fn();
const mockAbsensiLikes = jest.fn();
const mockAbsensiKomentar = jest.fn();
const mockFindClientById = jest.fn();

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersSocialByClient: mockGetUsersSocialByClient,
  getClientsByRole: mockGetClientsByRole,
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
let formatRekapUserData;
beforeAll(async () => {
  ({ dirRequestHandlers, formatRekapUserData } = await import('../src/handler/menu/dirRequestHandlers.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('choose_menu aggregates directorate data by client_id', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-08-27T16:06:00Z'));

  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'DITBINMAS', insta: null, tiktok: null },
    { client_id: 'POLRES_PASURUAN_KOTA', insta: 'x', tiktok: 'y' },
  ]);
  mockGetClientsByRole.mockResolvedValue([
    'polres_pasuruan_kota',
    'polres_sidoarjo',
  ]);
  mockFindClientById.mockImplementation(async (cid) => ({
    ditbinmas: { nama: 'DIT BINMAS', client_type: 'org' },
    polres_pasuruan_kota: {
      nama: 'POLRES PASURUAN KOTA',
      client_type: 'org',
    },
    polres_sidoarjo: { nama: 'POLRES SIDOARJO', client_type: 'polda' },
  })[cid.toLowerCase()]);

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
  expect(msg).not.toMatch(/1\. DIT BINMAS/);
  expect(msg).toContain('Jumlah Total User : 1');
  expect(msg).toContain('Jumlah Total User Sudah Update Data : 1');
  expect(msg).toContain('Jumlah Total User Belum Update Data : 0');
  expect(msg).toContain('POLRES PASURUAN KOTA');
  expect(msg.match(/POLRES PASURUAN KOTA/g).length).toBe(1);
  expect(msg).toMatch(/Client Belum Input Data:\n1\. POLRES SIDOARJO/);
  expect(msg).not.toMatch(/Client Belum Input Data.*PASURUAN/);
  expect(msg).not.toMatch(/POLRES SIDOARJO\n\nJumlah User/);
  const idxPasuruan = msg.indexOf('POLRES PASURUAN KOTA');
  const idxSidoarjo = msg.indexOf('POLRES SIDOARJO');
  expect(idxPasuruan).toBeLessThan(idxSidoarjo);
  jest.useRealTimers();
});

test('formatRekapUserData sorts by updated then total', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-08-27T16:06:00Z'));

  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'POLRES_A', insta: 'x', tiktok: 'y' },
    { client_id: 'POLRES_A', insta: 'x', tiktok: 'y' },
    { client_id: 'POLRES_B', insta: 'x', tiktok: 'y' },
    { client_id: 'POLRES_B', insta: 'x', tiktok: null },
    { client_id: 'POLRES_B', insta: 'x', tiktok: 'y' },
    { client_id: 'POLRES_C', insta: 'x', tiktok: 'y' },
  ]);
  mockGetClientsByRole.mockResolvedValue([
    'polres_a',
    'polres_b',
    'polres_c',
  ]);
  mockFindClientById.mockImplementation(async (cid) => ({
    ditbinmas: { nama: 'DIT BINMAS', client_type: 'direktorat' },
    polres_a: { nama: 'POLRES A', client_type: 'org' },
    polres_b: { nama: 'POLRES B', client_type: 'org' },
    polres_c: { nama: 'POLRES C', client_type: 'org' },
  })[cid.toLowerCase()]);

  const msg = await formatRekapUserData('ditbinmas', 'ditbinmas');

  const idxB = msg.indexOf('POLRES B');
  const idxA = msg.indexOf('POLRES A');
  const idxC = msg.indexOf('POLRES C');
  expect(idxB).toBeLessThan(idxA);
  expect(idxA).toBeLessThan(idxC);
  jest.useRealTimers();
});

test('choose_menu option 2 rekap user data ditbinmas', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-08-27T16:06:00Z'));

  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'ditbinmas', divisi: 'Sat A', title: 'AKP', nama: 'Budi' },
    { client_id: 'ditbinmas', divisi: 'Sat A', title: 'Bripka', nama: 'Agus' },
    { client_id: 'ditbinmas', divisi: 'Sat B', title: 'Kompol', nama: 'Charlie' },
    { client_id: 'other', divisi: 'Sat C', title: 'Aiptu', nama: 'Dodi' },
  ]);
  mockFindClientById.mockImplementation(async (cid) => ({
    ditbinmas: { nama: 'DIT BINMAS' },
  })[cid]);

  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '321';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '2', waClient);

  expect(mockGetUsersSocialByClient).toHaveBeenCalledWith('ditbinmas', 'ditbinmas');
  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toContain('SAT A (2)');
  expect(msg).toContain('AKP Budi');
  expect(msg).toContain('Bripka Agus');
  expect(msg).toContain('SAT B (1)');
  expect(msg).toContain('Kompol Charlie');
  expect(msg).not.toMatch(/Aiptu Dodi/);
  jest.useRealTimers();
});
