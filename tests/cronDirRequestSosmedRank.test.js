import { jest } from '@jest/globals';

const mockAbsensiLikes = jest.fn();
const mockAbsensiKomentar = jest.fn();
const mockSafeSend = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({ waGatewayClient: {} }));
jest.unstable_mockModule('../src/handler/fetchabsensi/insta/absensiLikesInsta.js', () => ({
  absensiLikes: mockAbsensiLikes,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js', () => ({
  absensiKomentar: mockAbsensiKomentar,
}));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  safeSendMessage: mockSafeSend,
  getAdminWAIds: () => ['123@c.us'],
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronDirRequestSosmedRank.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAbsensiLikes.mockResolvedValue('likes');
  mockAbsensiKomentar.mockResolvedValue('komentar');
});

test('runCron sends likes and komentar to admin and group', async () => {
  await runCron();

  expect(mockAbsensiLikes).toHaveBeenCalledWith('DITBINMAS', { mode: 'all', roleFlag: 'ditbinmas' });
  expect(mockAbsensiKomentar).toHaveBeenCalledWith('DITBINMAS', { roleFlag: 'ditbinmas' });

  expect(mockSafeSend).toHaveBeenCalledWith({}, '123@c.us', 'likes');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '123@c.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '120363419830216549@g.us', 'likes');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '120363419830216549@g.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledTimes(4);
});

test('runCron with rank recipient includes extra number', async () => {
  await runCron(true);

  expect(mockSafeSend).toHaveBeenCalledWith({}, '6281234560377@c.us', 'likes');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '6281234560377@c.us', 'komentar');
});
