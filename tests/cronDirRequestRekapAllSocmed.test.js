import { jest } from '@jest/globals';

const mockLapharDitbinmas = jest.fn();
const mockLapharTiktokDitbinmas = jest.fn();
const mockCollectLikesRecap = jest.fn();
const mockCollectKomentarRecap = jest.fn();
const mockSaveLikesRecapPerContentExcel = jest.fn();
const mockSaveCommentRecapExcel = jest.fn();
const mockFormatRekapAllSosmed = jest.fn();
const mockSendWAFile = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockGetAdminWAIds = jest.fn();
const mockSendDebug = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const mockReadFile = jest.fn();
const mockUnlink = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({ waGatewayClient: {} }));
jest.unstable_mockModule('../src/handler/fetchabsensi/insta/absensiLikesInsta.js', () => ({
  lapharDitbinmas: mockLapharDitbinmas,
  collectLikesRecap: mockCollectLikesRecap,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js', () => ({
  lapharTiktokDitbinmas: mockLapharTiktokDitbinmas,
  collectKomentarRecap: mockCollectKomentarRecap,
}));
jest.unstable_mockModule('../src/service/likesRecapExcelService.js', () => ({
  saveLikesRecapPerContentExcel: mockSaveLikesRecapPerContentExcel,
}));
jest.unstable_mockModule('../src/service/commentRecapExcelService.js', () => ({
  saveCommentRecapExcel: mockSaveCommentRecapExcel,
}));
jest.unstable_mockModule('../src/handler/menu/dirRequestHandlers.js', () => ({
  formatRekapAllSosmed: mockFormatRekapAllSosmed,
}));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  sendWAFile: mockSendWAFile,
  safeSendMessage: mockSafeSendMessage,
  getAdminWAIds: mockGetAdminWAIds,
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));
jest.unstable_mockModule('fs/promises', () => ({
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  readFile: mockReadFile,
  unlink: mockUnlink,
}));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronDirRequestRekapAllSocmed.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAdminWAIds.mockReturnValue(['123@c.us']);
  mockLapharDitbinmas.mockResolvedValue({
    text: 'ig',
    filename: 'ig.txt',
    narrative: 'nar ig',
    textBelum: 'igb',
    filenameBelum: 'igb.txt',
  });
  mockLapharTiktokDitbinmas.mockResolvedValue({
    text: 'tt',
    filename: 'tt.txt',
    narrative: 'nar tt',
    textBelum: 'ttb',
    filenameBelum: 'ttb.txt',
  });
  mockFormatRekapAllSosmed.mockReturnValue('*Laporan Harian Engagement – Ringkasan*');
  mockCollectLikesRecap.mockResolvedValue({ shortcodes: [1] });
  mockCollectKomentarRecap.mockResolvedValue({ videoIds: [1] });
  mockSaveLikesRecapPerContentExcel.mockResolvedValue('igrecap.xlsx');
  mockSaveCommentRecapExcel.mockResolvedValue('ttrecap.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  mockMkdir.mockResolvedValue();
  mockWriteFile.mockResolvedValue();
  mockUnlink.mockResolvedValue();
});

test('runCron without rekap sends to admin and group only', async () => {
  await runCron(false);

  expect(mockCollectLikesRecap).toHaveBeenCalledWith('DITBINMAS', { selfOnly: false });
  expect(mockCollectKomentarRecap).toHaveBeenCalledWith('DITBINMAS', { selfOnly: false });

  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    {},
    '123@c.us',
    '*Laporan Harian Engagement – Ringkasan*'
  );
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    {},
    '120363419830216549@g.us',
    '*Laporan Harian Engagement – Ringkasan*'
  );
  expect(mockSafeSendMessage).not.toHaveBeenCalledWith(
    {},
    '6281234560377@c.us',
    '*Laporan Harian Engagement – Ringkasan*'
  );

  expect(mockSendWAFile).not.toHaveBeenCalledWith(
    {},
    expect.any(Buffer),
    expect.any(String),
    '6281234560377@c.us',
    expect.any(String)
  );
});

test('runCron with rekap sends to all recipients', async () => {
  await runCron(true);

  expect(mockCollectLikesRecap).toHaveBeenCalledWith('DITBINMAS', { selfOnly: false });
  expect(mockCollectKomentarRecap).toHaveBeenCalledWith('DITBINMAS', { selfOnly: false });

  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    {},
    '123@c.us',
    '*Laporan Harian Engagement – Ringkasan*'
  );
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    {},
    '120363419830216549@g.us',
    '*Laporan Harian Engagement – Ringkasan*'
  );
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    {},
    '6281234560377@c.us',
    '*Laporan Harian Engagement – Ringkasan*'
  );

  expect(mockSendWAFile).toHaveBeenCalledWith(
    {},
    expect.any(Buffer),
    'ig.txt',
    '6281234560377@c.us',
    'text/plain'
  );
});

test('runCron archives files when LAPHAR_ARCHIVE is true', async () => {
  process.env.LAPHAR_ARCHIVE = 'true';
  await runCron(true);

  expect(mockMkdir).toHaveBeenCalledWith('laphar', { recursive: true });
  expect(mockWriteFile).toHaveBeenCalledWith('laphar/ig.txt', expect.any(Buffer));
  expect(mockWriteFile).toHaveBeenCalledWith('laphar/tt.txt', expect.any(Buffer));
  const unlinkArgs = mockUnlink.mock.calls.map((c) => c[0]);
  expect(unlinkArgs).toEqual(
    expect.arrayContaining(['igrecap.xlsx', 'ttrecap.xlsx', 'laphar/ig.txt', 'laphar/tt.txt'])
  );
  delete process.env.LAPHAR_ARCHIVE;
});
