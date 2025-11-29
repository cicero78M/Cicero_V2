import { jest } from '@jest/globals';

const mockAbsensiLikes = jest.fn();
const mockAbsensiKomentar = jest.fn();
const mockSafeSend = jest.fn();
const mockSendDebug = jest.fn();
const mockBuildClientRecipientSet = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({ waGatewayClient: {} }));
jest.unstable_mockModule('../src/handler/fetchabsensi/insta/absensiLikesInsta.js', () => ({
  absensiLikes: mockAbsensiLikes,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js', () => ({
  absensiKomentar: mockAbsensiKomentar,
}));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  safeSendMessage: mockSafeSend,
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));
jest.unstable_mockModule('../src/utils/recipientHelper.js', () => ({
  buildClientRecipientSet: mockBuildClientRecipientSet,
}));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronDirRequestSosmedRank.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAbsensiLikes.mockResolvedValue('likes');
  mockAbsensiKomentar.mockResolvedValue('komentar');
  mockBuildClientRecipientSet.mockResolvedValue({
    recipients: new Set(['123@c.us', 'group@g.us', 'super@c.us']),
    hasClientRecipients: true,
  });
});

test('runCron sends likes and komentar to admin, operator, super admin, and group', async () => {
  await runCron();

  expect(mockAbsensiLikes).toHaveBeenCalledWith('DITBINMAS', { mode: 'all', roleFlag: 'ditbinmas' });
  expect(mockAbsensiKomentar).toHaveBeenCalledWith('DITBINMAS', { roleFlag: 'ditbinmas' });

  expect(mockBuildClientRecipientSet).toHaveBeenCalledWith('DITBINMAS', { includeGroup: true });
  expect(mockSafeSend).toHaveBeenCalledWith({}, '123@c.us', 'likes');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '123@c.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'group@g.us', 'likes');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'group@g.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'super@c.us', 'likes');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'super@c.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledTimes(6);
});
