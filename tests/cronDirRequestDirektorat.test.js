import { jest } from '@jest/globals';

const mockAbsensi = jest.fn();
const mockKomentar = jest.fn();
const mockSafeSend = jest.fn();
const mockSendDebug = jest.fn();
const mockBuildClientRecipientSet = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({ waGatewayClient: {} }));
jest.unstable_mockModule('../src/handler/menu/dirRequestHandlers.js', () => ({
  absensiLikesDitbinmasSimple: mockAbsensi,
  absensiKomentarDitbinmasSimple: mockKomentar,
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
  ({ runCron } = await import('../src/cron/cronDirRequestDirektorat.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAbsensi.mockResolvedValue('absensi');
  mockKomentar.mockResolvedValue('komentar');
  mockBuildClientRecipientSet.mockResolvedValue({
    recipients: new Set(['123@c.us', '321@c.us', 'group@g.us']),
    hasClientRecipients: true,
  });
});

test('runCron sends absensi and komentar to admin, operator, and group', async () => {
  await runCron();

  expect(mockAbsensi).toHaveBeenCalledWith('DITBINMAS');
  expect(mockKomentar).toHaveBeenCalledWith('DITBINMAS');

  expect(mockBuildClientRecipientSet).toHaveBeenCalledWith('DITBINMAS');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '123@c.us', 'absensi');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '123@c.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '321@c.us', 'absensi');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '321@c.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'group@g.us', 'absensi');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'group@g.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledTimes(6);
});

