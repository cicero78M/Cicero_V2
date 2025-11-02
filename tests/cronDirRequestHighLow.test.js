import { jest } from '@jest/globals';

const mockGenerateWeeklyInstagramHighLowReport = jest.fn();
const mockGenerateWeeklyTiktokHighLowReport = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({ waGatewayClient: {} }));
jest.unstable_mockModule('../src/service/weeklyInstagramHighLowService.js', () => ({
  generateWeeklyInstagramHighLowReport: mockGenerateWeeklyInstagramHighLowReport,
}));
jest.unstable_mockModule('../src/service/weeklyTiktokHighLowService.js', () => ({
  generateWeeklyTiktokHighLowReport: mockGenerateWeeklyTiktokHighLowReport,
}));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  safeSendMessage: mockSafeSendMessage,
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronDirRequestHighLow.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGenerateWeeklyInstagramHighLowReport.mockResolvedValue('IG report');
  mockGenerateWeeklyTiktokHighLowReport.mockResolvedValue('TikTok report');
  mockSafeSendMessage.mockResolvedValue();
});

test('runCron sends Instagram and TikTok reports sequentially to Ditbinmas recipient', async () => {
  await runCron();

  expect(mockGenerateWeeklyInstagramHighLowReport).toHaveBeenCalledWith('DITBINMAS', { roleFlag: 'ditbinmas' });
  expect(mockGenerateWeeklyTiktokHighLowReport).toHaveBeenCalledWith('DITBINMAS', { roleFlag: 'ditbinmas' });

  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(1, {}, '6281234560377@c.us', 'IG report');
  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(2, {}, '6281234560377@c.us', 'TikTok report');
  expect(mockSafeSendMessage).toHaveBeenCalledTimes(2);

  const [firstSendOrder] = mockSafeSendMessage.mock.invocationCallOrder;
  const [tiktokServiceOrder] = mockGenerateWeeklyTiktokHighLowReport.mock.invocationCallOrder;
  expect(firstSendOrder).toBeLessThan(tiktokServiceOrder);
});
