import { jest } from '@jest/globals';

const mockCollectLikesRecap = jest.fn();
const mockCollectKomentarRecap = jest.fn();
const mockSaveLikesRecapPerContentExcel = jest.fn();
const mockSaveCommentRecapExcel = jest.fn();
const mockSendWAFile = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockSendDebug = jest.fn();
const mockReadFile = jest.fn();
const mockUnlink = jest.fn();
const mockBuildClientRecipientSet = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({ waGatewayClient: {} }));
jest.unstable_mockModule('../src/handler/fetchabsensi/insta/absensiLikesInsta.js', () => ({
  collectLikesRecap: mockCollectLikesRecap,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js', () => ({
  collectKomentarRecap: mockCollectKomentarRecap,
}));
jest.unstable_mockModule('../src/service/likesRecapExcelService.js', () => ({
  saveLikesRecapPerContentExcel: mockSaveLikesRecapPerContentExcel,
}));
jest.unstable_mockModule('../src/service/commentRecapExcelService.js', () => ({
  saveCommentRecapExcel: mockSaveCommentRecapExcel,
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
  readFile: mockReadFile,
  unlink: mockUnlink,
}));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronDirRequestRekapAllSocmed.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCollectLikesRecap.mockResolvedValue({ shortcodes: ['ig1'] });
  mockCollectKomentarRecap.mockResolvedValue({ videoIds: ['tt1'] });
  mockSaveLikesRecapPerContentExcel.mockResolvedValue('igrecap.xlsx');
  mockSaveCommentRecapExcel.mockResolvedValue('ttrecap.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  mockUnlink.mockResolvedValue();
  mockBuildClientRecipientSet.mockResolvedValue({
    recipients: new Set(['group@g.us']),
    hasClientRecipients: true,
  });
});

test('runCron sends recaps without fetching posts', async () => {
  await runCron();

  expect(mockCollectLikesRecap).toHaveBeenCalledWith('DITBINMAS', { selfOnly: false });
  expect(mockCollectKomentarRecap).toHaveBeenCalledWith('DITBINMAS', { selfOnly: false });

  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    {},
    'group@g.us',
    'Rekap harian: likes Instagram dan komentar TikTok.'
  );

  expect(mockSendWAFile).toHaveBeenCalledWith(
    {},
    expect.any(Buffer),
    'igrecap.xlsx',
    'group@g.us',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockSendWAFile).toHaveBeenCalledWith(
    {},
    expect.any(Buffer),
    'ttrecap.xlsx',
    'group@g.us',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});

test('runCron does not send messages when no recaps available', async () => {
  mockCollectLikesRecap.mockResolvedValue({ shortcodes: [] });
  mockCollectKomentarRecap.mockResolvedValue({ videoIds: [] });

  await runCron();

  expect(mockSafeSendMessage).not.toHaveBeenCalled();
  expect(mockSendWAFile).not.toHaveBeenCalled();
});
