import { jest } from '@jest/globals';

const mockAbsensi = jest.fn();
const mockKomentar = jest.fn();
const mockSafeSend = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({ waGatewayClient: {} }));
jest.unstable_mockModule('../src/handler/menu/dirRequestHandlers.js', () => ({
  absensiLikesDitbinmasSimple: mockAbsensi,
  absensiKomentarDitbinmasSimple: mockKomentar,
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
  ({ runCron } = await import('../src/cron/cronDirRequestDirektorat.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAbsensi.mockResolvedValue('absensi');
  mockKomentar.mockResolvedValue('komentar');
});

test('runCron sends absensi and komentar to admin and rekap recipient', async () => {
  await runCron();

  expect(mockAbsensi).toHaveBeenCalled();
  expect(mockKomentar).toHaveBeenCalled();

  expect(mockSafeSend).toHaveBeenCalledWith({}, '123@c.us', 'absensi');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '123@c.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '6281234560377@c.us', 'absensi');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '6281234560377@c.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledTimes(4);
});

