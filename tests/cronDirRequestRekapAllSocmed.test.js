import { jest } from '@jest/globals';

const mockLapharDitbinmas = jest.fn();
const mockLapharTiktokDitbinmas = jest.fn();
const mockCollectLikesRecap = jest.fn();
const mockCollectKomentarRecap = jest.fn();
const mockSaveLikesRecapExcel = jest.fn();
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

jest.unstable_mockModule('../src/service/waService.js', () => ({ default: {} }));
jest.unstable_mockModule('../src/handler/fetchabsensi/insta/absensiLikesInsta.js', () => ({
  lapharDitbinmas: mockLapharDitbinmas,
  collectLikesRecap: mockCollectLikesRecap,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js', () => ({
  lapharTiktokDitbinmas: mockLapharTiktokDitbinmas,
  collectKomentarRecap: mockCollectKomentarRecap,
}));
jest.unstable_mockModule('../src/service/likesRecapExcelService.js', () => ({
  saveLikesRecapExcel: mockSaveLikesRecapExcel,
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
  mockFormatRekapAllSosmed.mockReturnValue('nar ig + nar tt');
  mockCollectLikesRecap.mockResolvedValue({ shortcodes: [1] });
  mockCollectKomentarRecap.mockResolvedValue({ videoIds: [1] });
  mockSaveLikesRecapExcel.mockResolvedValue('igrecap.xlsx');
  mockSaveCommentRecapExcel.mockResolvedValue('ttrecap.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  mockMkdir.mockResolvedValue();
  mockWriteFile.mockResolvedValue();
  mockUnlink.mockResolvedValue();
});

test('runCron without rekap sends to admin and group only', async () => {
  await runCron(false);

  expect(mockSafeSendMessage).toHaveBeenCalledWith({}, '123@c.us', 'nar ig + nar tt');
  expect(mockSafeSendMessage).toHaveBeenCalledWith({}, '120363419830216549@g.us', 'nar ig + nar tt');
  expect(mockSafeSendMessage).not.toHaveBeenCalledWith({}, '6281234560377@c.us', 'nar ig + nar tt');

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

  expect(mockSafeSendMessage).toHaveBeenCalledWith({}, '123@c.us', 'nar ig + nar tt');
  expect(mockSafeSendMessage).toHaveBeenCalledWith({}, '120363419830216549@g.us', 'nar ig + nar tt');
  expect(mockSafeSendMessage).toHaveBeenCalledWith({}, '6281234560377@c.us', 'nar ig + nar tt');

  expect(mockSendWAFile).toHaveBeenCalledWith(
    {},
    expect.any(Buffer),
    'ig.txt',
    '6281234560377@c.us',
    'text/plain'
  );
});
