import { jest } from '@jest/globals';
import path from 'path';

process.env.TZ = 'Asia/Jakarta';

const mockGetUsersSocialByClient = jest.fn();
const mockGetClientsByRole = jest.fn();
const mockAbsensiLikes = jest.fn();
const mockAbsensiLikesDitbinmasReport = jest.fn();
const mockAbsensiKomentar = jest.fn();
const mockAbsensiKomentarDitbinmasReport = jest.fn();
const mockFindClientById = jest.fn();
const mockFetchAndStoreInstaContent = jest.fn();
const mockHandleFetchLikesInstagram = jest.fn();
const mockRekapLikesIG = jest.fn();
const mockLapharDitbinmas = jest.fn();
const mockLapharTiktokDitbinmas = jest.fn();
const mockCollectLikesRecap = jest.fn();
const mockSaveLikesRecapExcel = jest.fn();
const mockSaveWeeklyLikesRecapExcel = jest.fn();
const mockCollectKomentarRecap = jest.fn();
const mockSaveCommentRecapExcel = jest.fn();
const mockSaveWeeklyCommentRecapExcel = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const mockReadFile = jest.fn();
const mockUnlink = jest.fn();
const mockSendWAFile = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockFetchAndStoreTiktokContent = jest.fn();
const mockHandleFetchKomentarTiktokBatch = jest.fn();
const mockGenerateSosmedTaskMessage = jest.fn();

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersSocialByClient: mockGetUsersSocialByClient,
  getClientsByRole: mockGetClientsByRole,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/insta/absensiLikesInsta.js', () => ({
  absensiLikes: mockAbsensiLikes,
  rekapLikesIG: mockRekapLikesIG,
  lapharDitbinmas: mockLapharDitbinmas,
  absensiLikesDitbinmasReport: mockAbsensiLikesDitbinmasReport,
  collectLikesRecap: mockCollectLikesRecap,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js', () => ({
  absensiKomentar: mockAbsensiKomentar,
  lapharTiktokDitbinmas: mockLapharTiktokDitbinmas,
  collectKomentarRecap: mockCollectKomentarRecap,
  absensiKomentarDitbinmasReport: mockAbsensiKomentarDitbinmasReport,
}));
jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));
jest.unstable_mockModule('fs/promises', () => ({
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  readFile: mockReadFile,
  unlink: mockUnlink,
}));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  sendWAFile: mockSendWAFile,
  safeSendMessage: mockSafeSendMessage,
}));
jest.unstable_mockModule('../src/handler/fetchpost/instaFetchPost.js', () => ({
  fetchAndStoreInstaContent: mockFetchAndStoreInstaContent,
}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchLikesInstagram.js', () => ({
  handleFetchLikesInstagram: mockHandleFetchLikesInstagram,
}));
jest.unstable_mockModule('../src/handler/fetchpost/tiktokFetchPost.js', () => ({
  fetchAndStoreTiktokContent: mockFetchAndStoreTiktokContent,
}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchCommentTiktok.js', () => ({
  handleFetchKomentarTiktokBatch: mockHandleFetchKomentarTiktokBatch,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/sosmedTask.js', () => ({
  generateSosmedTaskMessage: mockGenerateSosmedTaskMessage,
}));
jest.unstable_mockModule('../src/service/likesRecapExcelService.js', () => ({
  saveLikesRecapExcel: mockSaveLikesRecapExcel,
}));
jest.unstable_mockModule('../src/service/commentRecapExcelService.js', () => ({
  saveCommentRecapExcel: mockSaveCommentRecapExcel,
}));
jest.unstable_mockModule('../src/service/weeklyLikesRecapExcelService.js', () => ({
  saveWeeklyLikesRecapExcel: mockSaveWeeklyLikesRecapExcel,
}));
jest.unstable_mockModule(
  '../src/service/weeklyCommentRecapExcelService.js',
  () => ({
    saveWeeklyCommentRecapExcel: mockSaveWeeklyCommentRecapExcel,
  })
);
jest.unstable_mockModule('../src/utils/utilsHelper.js', () => ({
  getGreeting: () => 'Selamat malam',
  sortDivisionKeys: (arr) => arr.sort(),
  formatNama: (u) => `${u.title || ''} ${u.nama || ''}`.trim(),
}));

let dirRequestHandlers;
let formatRekapUserData;
let dirRequestHandlersModule;
beforeAll(async () => {
  dirRequestHandlersModule = await import('../src/handler/menu/dirRequestHandlers.js');
  ({ dirRequestHandlers, formatRekapUserData } = dirRequestHandlersModule);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMkdir.mockResolvedValue();
  mockWriteFile.mockResolvedValue();
});

test('main filters non-direktorat client IDs', async () => {
  mockFindClientById.mockImplementation(async (cid) => ({
    a: { nama: 'CLIENT A', client_type: 'direktorat' },
    b: { nama: 'CLIENT B', client_type: 'org' },
    c: { nama: 'CLIENT C', client_type: 'direktorat' },
  })[cid.toLowerCase()]);
  const session = { client_ids: ['a', 'b', 'c'] };
  const chatId = '123';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.main(session, chatId, '', waClient);

  expect(session.client_ids).toEqual(['a', 'c']);
  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toMatch(/1\. CLIENT A \(A\)/);
  expect(msg).toMatch(/2\. CLIENT C \(C\)/);
  expect(msg).not.toMatch(/CLIENT B/);
  expect(session.step).toBe('choose_client');
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
  expect(msg).toMatch(/Jumlah Total Personil Belum Mengisi Instagram : 1/);
  expect(msg).toMatch(/Jumlah Total Personil Belum Mengisi Tiktok : 1/);
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

test('choose_menu option 2 executive summary reports totals', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-09-05T00:46:00Z'));
  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'a', insta: 'x', tiktok: 'y' },
    { client_id: 'a', insta: null, tiktok: 'y' },
    { client_id: 'b', insta: 'x', tiktok: null },
  ]);
  mockFindClientById.mockImplementation(async (cid) => ({ nama: cid.toUpperCase() }));
  const session = { selectedClientId: 'a', clientName: 'A' };
  const chatId = '111';
  const waClient = { sendMessage: jest.fn() };
  await dirRequestHandlers.choose_menu(session, chatId, '2', waClient);
  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toMatch(/\*Personil Saat ini:\* 3/);
  expect(msg).toMatch(/IG 66\.7% \(2\/3\)/);
  expect(msg).toMatch(/TT 66\.7% \(2\/3\)/);
  expect(msg).toMatch(/User Belum Update data/);
  jest.useRealTimers();
});

test('choose_menu option 3 absensi likes ditbinmas', async () => {
  mockAbsensiLikesDitbinmasReport.mockResolvedValue('laporan');

  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '321';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '3', waClient);

  expect(mockAbsensiLikesDitbinmasReport).toHaveBeenCalled();
  expect(mockAbsensiLikes).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'laporan');
});

test('choose_menu option 5 absensi komentar tiktok', async () => {
  mockAbsensiKomentar.mockResolvedValue('laporan komentar');

  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '333';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '5', waClient);

  expect(mockAbsensiKomentar).toHaveBeenCalledWith('DITBINMAS', { roleFlag: 'ditbinmas' });
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'laporan komentar');
});

test('choose_menu option 16 absensi komentar ditbinmas detail', async () => {
  mockAbsensiKomentarDitbinmasReport.mockResolvedValue('detail komentar');

  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '444';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '16', waClient);

  expect(mockAbsensiKomentarDitbinmasReport).toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'detail komentar');
});

test('choose_menu option 4 absensi likes uses ditbinmas data for all users', async () => {
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

  await dirRequestHandlers.choose_menu(session, chatId, '4', waClient);

  expect(mockAbsensiLikes).toHaveBeenCalledWith('DITBINMAS', {
    mode: 'all',
    roleFlag: 'ditbinmas',
  });
});

test('choose_menu option 4 skips ketika client bukan ditbinmas', async () => {
  mockAbsensiLikes.mockResolvedValue('laporan');

  const session = {
    role: 'polres',
    selectedClientId: 'polres_a',
    clientName: 'POLRES A',
  };
  const chatId = '555';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '4', waClient);

  expect(mockAbsensiLikes).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('DITBINMAS')
  );
});


test('choose_menu option 6 fetch insta returns rekap likes report', async () => {
  mockFetchAndStoreInstaContent.mockResolvedValue();
  mockHandleFetchLikesInstagram.mockResolvedValue();
  mockRekapLikesIG.mockResolvedValue('laporan likes');
  mockSafeSendMessage.mockResolvedValue(true);

  const session = {
    role: 'ditbinmas',
    selectedClientId: 'ditbinmas',
    clientName: 'DITBINMAS',
    dir_client_id: 'ditbinmas',
  };
  const chatId = '777';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '6', waClient);

  expect(mockFetchAndStoreInstaContent).toHaveBeenCalledWith(
    ['shortcode', 'caption', 'like_count', 'timestamp'],
    waClient,
    chatId,
    'DITBINMAS'
  );
  expect(mockHandleFetchLikesInstagram).toHaveBeenCalledWith(null, null, 'DITBINMAS');
  expect(mockRekapLikesIG).toHaveBeenCalledWith('DITBINMAS');
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'laporan likes');
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    waClient,
    '120363419830216549@g.us',
    'laporan likes'
  );
});

test('choose_menu option 8 fetch tiktok returns komentar report', async () => {
  mockFetchAndStoreTiktokContent.mockResolvedValue();
  mockHandleFetchKomentarTiktokBatch.mockResolvedValue();
  mockAbsensiKomentarDitbinmasReport.mockResolvedValue('laporan tiktok');
  mockSafeSendMessage.mockResolvedValue(true);
  mockFindClientById.mockResolvedValue({ client_type: 'direktorat', nama: 'DITBINMAS' });

  const session = {
    role: 'ditbinmas',
    selectedClientId: 'ditbinmas',
    clientName: 'DITBINMAS',
    dir_client_id: 'ditbinmas',
  };
  const chatId = '888';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '8', waClient);

  expect(mockFetchAndStoreTiktokContent).toHaveBeenCalledWith(
    'DITBINMAS',
    waClient,
    chatId
  );
  expect(mockHandleFetchKomentarTiktokBatch).toHaveBeenCalledWith(
    waClient,
    chatId,
    'DITBINMAS'
  );
  expect(mockAbsensiKomentarDitbinmasReport).toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'laporan tiktok');
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    waClient,
    '120363419830216549@g.us',
    'laporan tiktok'
  );
});

test('choose_menu option 12 fetch sosial media sends combined task', async () => {
  mockFetchAndStoreInstaContent.mockResolvedValue();
  mockHandleFetchLikesInstagram.mockResolvedValue();
  mockFetchAndStoreTiktokContent.mockResolvedValue();
        mockHandleFetchKomentarTiktokBatch.mockResolvedValue();
        mockGenerateSosmedTaskMessage.mockResolvedValue({
          text: 'tugas sosmed',
          igCount: 0,
          tiktokCount: 0,
        });
  mockSafeSendMessage.mockResolvedValue(true);
  mockFindClientById.mockResolvedValue({ client_type: 'direktorat', nama: 'DITBINMAS' });

  const session = {
    role: 'ditbinmas',
    selectedClientId: 'ditbinmas',
    clientName: 'DITBINMAS',
    dir_client_id: 'ditbinmas',
  };
  const chatId = '1001';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '12', waClient);

  expect(mockFetchAndStoreInstaContent).toHaveBeenCalledWith(
    ['shortcode', 'caption', 'like_count', 'timestamp'],
    waClient,
    chatId,
    'DITBINMAS'
  );
  expect(mockHandleFetchLikesInstagram).toHaveBeenCalledWith(null, null, 'DITBINMAS');
  expect(mockFetchAndStoreTiktokContent).toHaveBeenCalledWith(
    'DITBINMAS',
    waClient,
    chatId
  );
    expect(mockHandleFetchKomentarTiktokBatch).toHaveBeenCalledWith(null, null, 'DITBINMAS');
    expect(mockGenerateSosmedTaskMessage).toHaveBeenCalledWith('DITBINMAS', {
      skipTiktokFetch: true,
      skipLikesFetch: true,
    });
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'tugas sosmed');
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    waClient,
    '120363419830216549@g.us',
    'tugas sosmed'
  );
});

test('choose_menu option 10 sends laphar file, narrative, and likes recap excel', async () => {
  mockLapharDitbinmas.mockResolvedValue({
    text: 'lap',
    filename: 'lap.txt',
    textBelum: 'belum',
    filenameBelum: 'belum.txt',
    narrative: 'narasi',
  });
  mockCollectLikesRecap.mockResolvedValue({ shortcodes: ['sc1'] });
  mockSaveLikesRecapExcel.mockResolvedValue('/tmp/recap.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  mockUnlink.mockResolvedValue();
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '999';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '10', waClient);

  expect(mockLapharDitbinmas).toHaveBeenCalled();
  expect(mockCollectLikesRecap).toHaveBeenCalledWith('ditbinmas');
  expect(mockSaveLikesRecapExcel).toHaveBeenCalledWith({ shortcodes: ['sc1'] }, 'ditbinmas');
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/recap.xlsx');
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/recap.xlsx');
  expect(mockMkdir).toHaveBeenCalledWith('laphar', { recursive: true });
  expect(mockWriteFile).toHaveBeenNthCalledWith(
    1,
    path.join('laphar', 'lap.txt'),
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
    path.join('laphar', 'belum.txt'),
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
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    3,
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/recap.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(waClient.sendMessage.mock.calls[0][0]).toBe(chatId);
  expect(waClient.sendMessage.mock.calls[0][1]).toBe('narasi');
  expect(waClient.sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
    mockWriteFile.mock.invocationCallOrder[0],
  );
});

test('choose_menu option 13 sends tiktok laphar file narrative and recap excel', async () => {
  mockLapharTiktokDitbinmas.mockResolvedValue({
    text: 'lap',
    filename: 'lap.txt',
    textBelum: 'belum',
    filenameBelum: 'belum.txt',
    narrative: 'narasi',
  });
  mockCollectKomentarRecap.mockResolvedValue({
    videoIds: ['vid1'],
    recap: { POLRES_A: [{ pangkat: 'AKP', nama: 'Budi', satfung: 'SAT A', vid1: 1 }] },
  });
  mockSaveCommentRecapExcel.mockResolvedValue('/tmp/komentar.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '555';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '13', waClient);

  expect(mockLapharTiktokDitbinmas).toHaveBeenCalled();
  expect(mockCollectKomentarRecap).toHaveBeenCalledWith('ditbinmas');
  expect(mockSaveCommentRecapExcel).toHaveBeenCalledWith({
    videoIds: ['vid1'],
    recap: { POLRES_A: [{ pangkat: 'AKP', nama: 'Budi', satfung: 'SAT A', vid1: 1 }] },
  }, 'ditbinmas');
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/komentar.xlsx');
  expect(mockMkdir).toHaveBeenCalledWith('laphar', { recursive: true });
  expect(mockWriteFile).toHaveBeenNthCalledWith(
    1,
    path.join('laphar', 'lap.txt'),
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
    path.join('laphar', 'belum.txt'),
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
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    3,
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/komentar.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/komentar.xlsx');
  expect(waClient.sendMessage.mock.calls[0][0]).toBe(chatId);
  expect(waClient.sendMessage.mock.calls[0][1]).toBe('narasi');
});

test('choose_menu option 14 generates likes recap excel and sends file', async () => {
  mockCollectLikesRecap.mockResolvedValue({
    shortcodes: ['sc1'],
    recap: { POLRES_A: [{ pangkat: 'AKP', nama: 'Budi', satfung: 'SAT A', sc1: 1 }] },
  });
  mockSaveLikesRecapExcel.mockResolvedValue('/tmp/recap.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '777';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '14', waClient);

  expect(mockCollectLikesRecap).toHaveBeenCalledWith('ditbinmas');
  expect(mockSaveLikesRecapExcel).toHaveBeenCalledWith({
    shortcodes: ['sc1'],
    recap: { POLRES_A: [{ pangkat: 'AKP', nama: 'Budi', satfung: 'SAT A', sc1: 1 }] },
  }, 'ditbinmas');
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/recap.xlsx');
  expect(mockSendWAFile).toHaveBeenCalledWith(
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/recap.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/recap.xlsx');
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('File Excel dikirim')
  );
});

test('choose_menu option 17 generates weekly likes recap excel and sends file', async () => {
  mockSaveWeeklyLikesRecapExcel.mockResolvedValue('/tmp/weekly.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '789';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '17', waClient);

  expect(mockSaveWeeklyLikesRecapExcel).toHaveBeenCalledWith('ditbinmas');
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/weekly.xlsx');
  expect(mockSendWAFile).toHaveBeenCalledWith(
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/weekly.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/weekly.xlsx');
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('File Excel dikirim')
  );
});

test('choose_menu option 18 generates weekly tiktok recap excel and sends file', async () => {
  mockSaveWeeklyCommentRecapExcel.mockResolvedValue('/tmp/weekly-tt.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '790';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '18', waClient);

  expect(mockSaveWeeklyCommentRecapExcel).toHaveBeenCalledWith('ditbinmas');
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/weekly-tt.xlsx');
  expect(mockSendWAFile).toHaveBeenCalledWith(
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/weekly-tt.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/weekly-tt.xlsx');
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('File Excel dikirim')
  );
});

test('choose_menu option 15 sends combined sosmed recap and files', async () => {
  mockLapharDitbinmas.mockResolvedValue({
    text: 'ig',
    filename: 'ig.txt',
    narrative:
      'IGHEADER\nDIREKTORAT BINMAS\nIGPART\nAbsensi Update Data\nIGUPDATE',
  });
  mockCollectLikesRecap.mockResolvedValue({ shortcodes: ['sc1'] });
  mockSaveLikesRecapExcel.mockResolvedValue('/tmp/ig.xlsx');
  mockLapharTiktokDitbinmas.mockResolvedValue({
    text: 'tt',
    filename: 'tt.txt',
    narrative:
      'TTHEADER\nDIREKTORAT BINMAS\nTTPART\nAbsensi Update Data\nTTUPDATE',
  });
  mockCollectKomentarRecap.mockResolvedValue({ videoIds: ['vid1'] });
  mockSaveCommentRecapExcel.mockResolvedValue('/tmp/tt.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  mockUnlink.mockResolvedValue();
  mockGetUsersSocialByClient.mockResolvedValue([]);
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '888';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '15', waClient);

  expect(mockLapharDitbinmas).toHaveBeenCalled();
  expect(mockLapharTiktokDitbinmas).toHaveBeenCalled();
  const combined = waClient.sendMessage.mock.calls[0][1];
  expect(combined).toContain('IGPART');
  expect(combined).toContain('TTPART');
  expect(combined).toContain('ABSENSI UPDATE DATA PERSONIL');
  expect(combined).toContain('IGUPDATE');
  expect(combined).not.toContain('TTUPDATE');
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    1,
    waClient,
    expect.any(Buffer),
    'ig.txt',
    chatId,
    'text/plain'
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    2,
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/ig.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    3,
    waClient,
    expect.any(Buffer),
    'tt.txt',
    chatId,
    'text/plain'
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    4,
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/tt.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/ig.xlsx');
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/tt.xlsx');
});
test('choose_menu option 11 reports ditbinmas incomplete users by division', async () => {
  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'DITBINMAS', divisi: 'Div A', title: 'AKP', nama: 'Budi', insta: null, tiktok: 'x' },
    { client_id: 'DITBINMAS', divisi: 'Div A', title: 'IPTU', nama: 'Adi', insta: 'y', tiktok: null },
    { client_id: 'DITBINMAS', divisi: 'Div B', title: 'KOMPOL', nama: 'Cici', insta: null, tiktok: null },
    { client_id: 'POLRES_A', divisi: 'Div B', title: 'AKP', nama: 'Edi', insta: null, tiktok: null },
  ]);
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '444';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '11', waClient);

  expect(mockGetUsersSocialByClient).toHaveBeenCalledWith('DITBINMAS', 'ditbinmas');
  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toMatch(/\*DIV A\* \(2\)/);
  expect(msg).toMatch(/AKP Budi, Instagram kosong/);
  expect(msg).toMatch(/IPTU Adi, TikTok kosong/);
  const idxBudi = msg.indexOf('AKP Budi');
  const idxAdi = msg.indexOf('IPTU Adi');
  expect(idxBudi).toBeLessThan(idxAdi);
  expect(msg).toMatch(/\*DIV B\* \(1\)/);
  expect(msg).toMatch(/KOMPOL Cici, Instagram kosong, TikTok kosong/);
  expect(msg).not.toMatch(/Edi/);
});
