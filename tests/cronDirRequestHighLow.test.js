import { jest } from '@jest/globals';

const mockGenerateWeeklyInstagramHighLowReport = jest.fn();
const mockGenerateWeeklyTiktokHighLowReport = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockSendDebug = jest.fn();
const mockBuildClientRecipientSet = jest.fn();

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
jest.unstable_mockModule('../src/utils/recipientHelper.js', () => ({
  buildClientRecipientSet: mockBuildClientRecipientSet,
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
  mockBuildClientRecipientSet.mockResolvedValue({
    recipients: new Set(['111@c.us', '222@c.us', '120@c.us']),
    hasClientRecipients: true,
  });
});

test('runCron sends Instagram and TikTok reports sequentially to Ditbinmas recipients', async () => {
  const recipientSet = new Set(['111@c.us', '222@c.us', '120@c.us']);
  mockBuildClientRecipientSet.mockResolvedValue({
    recipients: recipientSet,
    hasClientRecipients: true,
  });

  await runCron('DITBINMAS');

  expect(mockBuildClientRecipientSet).toHaveBeenCalledWith('DITBINMAS');
  expect(mockGenerateWeeklyInstagramHighLowReport).toHaveBeenCalledWith('DITBINMAS', {
    roleFlag: 'ditbinmas',
  });
  expect(mockGenerateWeeklyTiktokHighLowReport).toHaveBeenCalledWith('DITBINMAS', {
    roleFlag: 'ditbinmas',
  });

  const targets = Array.from(recipientSet);
  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(1, {}, targets[0], 'IG report');
  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(2, {}, targets[0], 'TikTok report');
  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(3, {}, targets[1], 'IG report');
  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(4, {}, targets[1], 'TikTok report');
  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(5, {}, targets[2], 'IG report');
  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(6, {}, targets[2], 'TikTok report');
  expect(mockSafeSendMessage).toHaveBeenCalledTimes(6);
});
