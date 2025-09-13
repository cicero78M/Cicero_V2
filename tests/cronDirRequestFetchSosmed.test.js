import { jest } from '@jest/globals';

const mockFetchInsta = jest.fn();
const mockFetchLikes = jest.fn();
const mockFetchTiktok = jest.fn();
const mockGenerateMsg = jest.fn();
const mockSafeSend = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({ waGatewayClient: {} }));
jest.unstable_mockModule('../src/handler/fetchpost/instaFetchPost.js', () => ({
  fetchAndStoreInstaContent: mockFetchInsta,
}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchLikesInstagram.js', () => ({
  handleFetchLikesInstagram: mockFetchLikes,
}));
jest.unstable_mockModule('../src/handler/fetchpost/tiktokFetchPost.js', () => ({
  fetchAndStoreTiktokContent: mockFetchTiktok,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/sosmedTask.js', () => ({
  generateSosmedTaskMessage: mockGenerateMsg,
}));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  safeSendMessage: mockSafeSend,
  getAdminWAIds: () => ['123@c.us'],
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

let runCron;

beforeEach(async () => {
  jest.resetModules();
  jest.clearAllMocks();
  mockGenerateMsg.mockResolvedValue({ text: 'msg', igCount: 1, tiktokCount: 1 });
  ({ runCron } = await import('../src/cron/cronDirRequestFetchSosmed.js'));
});

test('runCron fetches sosmed and sends message to recipients', async () => {
  await runCron();

  expect(mockFetchInsta).toHaveBeenCalledWith(
    ['shortcode', 'caption', 'like_count', 'timestamp'],
    null,
    null,
    'DITBINMAS'
  );
  expect(mockFetchLikes).toHaveBeenCalledWith(null, null, 'DITBINMAS');
  expect(mockFetchTiktok).toHaveBeenCalledWith('DITBINMAS');
  expect(mockGenerateMsg).toHaveBeenCalled();
  expect(mockSafeSend).toHaveBeenCalledWith({}, '123@c.us', 'msg');
  expect(mockSafeSend).toHaveBeenCalledWith(
    {},
    '120363419830216549@g.us',
    'msg'
  );
});

test('runCron skips sending when counts unchanged', async () => {
  await runCron();
  mockSafeSend.mockClear();
  await runCron();
  expect(mockSafeSend).not.toHaveBeenCalled();
});
