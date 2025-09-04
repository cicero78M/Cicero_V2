import { jest } from '@jest/globals';

process.env.TZ = 'Asia/Jakarta';

const mockGetUsersSocialByClient = jest.fn();
const mockGetClientsByRole = jest.fn();
const mockAbsensiLikes = jest.fn();
const mockAbsensiLikesDitbinmasReport = jest.fn();
const mockAbsensiKomentar = jest.fn();
const mockFindClientById = jest.fn();
const mockFetchAndStoreInstaContent = jest.fn();
const mockHandleFetchLikesInstagram = jest.fn();
const mockRekapLikesIG = jest.fn();
const mockLapharDitbinmas = jest.fn();
const mockWriteFile = jest.fn();
const mockSendWAFile = jest.fn();

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersSocialByClient: mockGetUsersSocialByClient,
  getClientsByRole: mockGetClientsByRole,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/insta/absensiLikesInsta.js', () => ({
  absensiLikes: mockAbsensiLikes,
  rekapLikesIG: mockRekapLikesIG,
  lapharDitbinmas: mockLapharDitbinmas,
  absensiLikesDitbinmasReport: mockAbsensiLikesDitbinmasReport,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js', () => ({
  absensiKomentar: mockAbsensiKomentar,
}));
jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));
jest.unstable_mockModule('fs/promises', () => ({ writeFile: mockWriteFile }));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({ sendWAFile: mockSendWAFile }));
jest.unstable_mockModule('../src/handler/fetchpost/instaFetchPost.js', () => ({
  fetchAndStoreInstaContent: mockFetchAndStoreInstaContent,
}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchLikesInstagram.js', () => ({
  handleFetchLikesInstagram: mockHandleFetchLikesInstagram,
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
  expect(msg).toMatch(/1\. DIT BINMAS/);
  expect(msg).toMatch(/Jumlah Total Personil : 2/);
  expect(msg).toMatch(/Jumlah Total Personil Sudah Mengisi Instagram : 1/);
  expect(msg).toMatch(/Jumlah Total Personil Sudah Mengisi Tiktok : 1/);
  expect(msg).toMatch(/Jumlah Total User Belum Update Data : 1/);
  const idxBinmas = msg.indexOf('DIT BINMAS');
  const idxPasuruan = msg.indexOf('POLRES PASURUAN KOTA');
  expect(idxBinmas).toBeLessThan(idxPasuruan);
  expect(msg).toMatch(/Client Belum Input Data:\n1\. POLRES SIDOARJO/);
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

  const idxBinmas = msg.indexOf('DIT BINMAS');
  const idxB = msg.indexOf('POLRES B');
  const idxA = msg.indexOf('POLRES A');
  const idxC = msg.indexOf('POLRES C');
  expect(idxBinmas).toBeLessThan(idxB);
  expect(idxB).toBeLessThan(idxA);
  expect(idxA).toBeLessThan(idxC);
  jest.useRealTimers();
});

test('formatRekapUserData orders users by rank', async () => {
  mockFindClientById.mockResolvedValue({ client_type: 'org', nama: 'POLRES A' });
  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'POLRES_A', divisi: 'Sat A', title: 'AKP', nama: 'Budi', insta: 'x', tiktok: 'y' },
    { client_id: 'POLRES_A', divisi: 'Sat A', title: 'KOMPOL', nama: 'Agus', insta: 'x', tiktok: 'y' },
    { client_id: 'POLRES_A', divisi: 'Sat A', title: 'IPDA', nama: 'Charlie', insta: 'x', tiktok: null },
  ]);
  const msg = await formatRekapUserData('POLRES_A');
  const idxKompol = msg.indexOf('KOMPOL Agus');
  const idxAkp = msg.indexOf('AKP Budi');
  const idxIpda = msg.indexOf('IPDA Charlie');
  expect(idxKompol).toBeLessThan(idxAkp);
  expect(idxAkp).toBeLessThan(idxIpda);
});

test('choose_menu option 2 absensi likes ditbinmas', async () => {
  mockAbsensiLikesDitbinmasReport.mockResolvedValue('laporan');

  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '321';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '2', waClient);

  expect(mockAbsensiLikesDitbinmasReport).toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'laporan');
});

test('choose_menu option 3 absensi likes uses ditbinmas data for all users', async () => {
  mockAbsensiLikes.mockResolvedValue('laporan');
  mockFindClientById.mockResolvedValue({ client_type: 'org', nama: 'POLRES A' });

  const session = {
    role: 'ditbinmas',
    selectedClientId: 'polres_a',
    clientName: 'POLRES A',
    dir_client_id: 'ditbinmas',
  };
  const chatId = '999';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '3', waClient);

  expect(mockAbsensiLikes).toHaveBeenCalledWith('DITBINMAS', {
    mode: 'all',
    roleFlag: 'ditbinmas',
    clientFilter: 'DITBINMAS',
  });
});

test('choose_menu option 3 skips when client is not ditbinmas', async () => {
  mockAbsensiLikes.mockResolvedValue('laporan');

  const session = {
    role: 'polres',
    selectedClientId: 'polres_a',
    clientName: 'POLRES A',
  };
  const chatId = '555';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '3', waClient);

  expect(mockAbsensiLikes).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('DITBINMAS')
  );
});

test('choose_menu option 5 fetch insta returns rekap likes report', async () => {
  mockFetchAndStoreInstaContent.mockResolvedValue();
  mockHandleFetchLikesInstagram.mockResolvedValue();
  mockRekapLikesIG.mockResolvedValue('laporan likes');

  const session = {
    role: 'ditbinmas',
    selectedClientId: 'ditbinmas',
    clientName: 'DITBINMAS',
    dir_client_id: 'ditbinmas',
  };
  const chatId = '777';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '5', waClient);

  expect(mockFetchAndStoreInstaContent).toHaveBeenCalledWith(
    ['shortcode', 'caption', 'like_count', 'timestamp'],
    waClient,
    chatId,
    'DITBINMAS'
  );
  expect(mockHandleFetchLikesInstagram).toHaveBeenCalledWith(null, null, 'DITBINMAS');
  expect(mockRekapLikesIG).toHaveBeenCalledWith('DITBINMAS');
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'laporan likes');
});

test('choose_menu option 9 sends laphar file and narrative', async () => {
  mockLapharDitbinmas.mockResolvedValue({
    text: 'lap',
    filename: 'lap.txt',
    textBelum: 'belum',
    filenameBelum: 'belum.txt',
    narrative: 'narasi',
  });
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '999';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '9', waClient);

  expect(mockLapharDitbinmas).toHaveBeenCalled();
  expect(mockWriteFile).toHaveBeenNthCalledWith(
    1,
    'lap.txt',
    expect.any(Buffer)
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    1,
    waClient,
    expect.any(Buffer),
    'lap.txt',
    chatId,
    'text/plain'
  );
  expect(mockWriteFile).toHaveBeenNthCalledWith(
    2,
    'belum.txt',
    expect.any(Buffer)
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    2,
    waClient,
    expect.any(Buffer),
    'belum.txt',
    chatId,
    'text/plain'
  );
  expect(waClient.sendMessage.mock.calls[0][1]).toBe('narasi');
});
