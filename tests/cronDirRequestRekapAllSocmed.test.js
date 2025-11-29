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
const mockSendDebug = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const mockReadFile = jest.fn();
const mockUnlink = jest.fn();
const mockBuildClientRecipientSet = jest.fn();

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
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));
jest.unstable_mockModule('../src/utils/recipientHelper.js', () => ({
  buildClientRecipientSet: mockBuildClientRecipientSet,
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
  mockBuildClientRecipientSet.mockResolvedValue({
    recipients: new Set(['group@g.us']),
    hasClientRecipients: true,
  });
});

test('runCron sends only to group recipients', async () => {
  await runCron();

  expect(mockCollectLikesRecap).toHaveBeenCalledWith('DITBINMAS', { selfOnly: false });
  expect(mockCollectKomentarRecap).toHaveBeenCalledWith('DITBINMAS', { selfOnly: false });

  expect(mockBuildClientRecipientSet).toHaveBeenCalledWith('DITBINMAS', {
    includeGroup: true,
    includeAdmins: false,
    includeSuper: false,
    includeOperator: false,
  });

  expect(mockSafeSendMessage).toHaveBeenCalledWith({}, 'group@g.us', '*Laporan Harian Engagement – Ringkasan*');

  expect(mockSendWAFile).toHaveBeenCalledWith({}, expect.any(Buffer), 'ig.txt', 'group@g.us', 'text/plain');
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
