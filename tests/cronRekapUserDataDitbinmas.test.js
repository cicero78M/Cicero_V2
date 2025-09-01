import { jest } from '@jest/globals';

const mockFormatRekapUserData = jest.fn().mockResolvedValue('msg');
const mockSendMessage = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/handler/menu/dirRequestHandlers.js', () => ({
  formatRekapUserData: mockFormatRekapUserData,
}));
jest.unstable_mockModule('../src/service/waService.js', () => ({
  default: { sendMessage: mockSendMessage },
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronRekapUserDataDitbinmas.js'));
});

test('runCron sends rekap to Ditbinmas group', async () => {
  await runCron();
  expect(mockFormatRekapUserData).toHaveBeenCalledWith('ditbinmas', 'ditbinmas');
  expect(mockSendMessage).toHaveBeenCalledWith('120363419830216549@g.us', 'msg');
});
