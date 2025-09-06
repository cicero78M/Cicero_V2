import { jest } from '@jest/globals';

const mockExecSummary = jest.fn();
const mockRekapUser = jest.fn();
const mockSafeSend = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({ default: {} }));
jest.unstable_mockModule('../src/handler/menu/dirRequestHandlers.js', () => ({
  formatExecutiveSummary: mockExecSummary,
  formatRekapUserData: mockRekapUser,
}));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  safeSendMessage: mockSafeSend,
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronDirRequestRekapUpdate.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADMIN_WHATSAPP = '123';
  mockExecSummary.mockResolvedValue('exec');
  mockRekapUser.mockResolvedValue('rekap');
});

test('runCron sends exec summary and rekap to admin and group', async () => {
  await runCron();

  expect(mockExecSummary).toHaveBeenCalledWith('DITBINMAS', 'ditbinmas');
  expect(mockRekapUser).toHaveBeenCalledWith('DITBINMAS', 'ditbinmas');

  expect(mockSafeSend).toHaveBeenCalledWith({}, '123@c.us', 'exec');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '123@c.us', 'rekap');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '120363419830216549@g.us', 'exec');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '120363419830216549@g.us', 'rekap');
  expect(mockSafeSend).toHaveBeenCalledTimes(4);
});

