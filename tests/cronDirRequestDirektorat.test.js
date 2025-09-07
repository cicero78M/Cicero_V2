import { jest } from '@jest/globals';

const mockAbsensi = jest.fn();
const mockRekap = jest.fn();
const mockSafeSend = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({ default: {} }));
jest.unstable_mockModule('../src/handler/menu/dirRequestHandlers.js', () => ({
  absensiLikesDitbinmas: mockAbsensi,
  formatRekapBelumLengkapDitbinmas: mockRekap,
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
  mockRekap.mockResolvedValue('rekap');
});

test('runCron sends absensi and rekap to admin and rekap recipient', async () => {
  await runCron();

  expect(mockAbsensi).toHaveBeenCalled();
  expect(mockRekap).toHaveBeenCalled();

  expect(mockSafeSend).toHaveBeenCalledWith({}, '123@c.us', 'absensi');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '123@c.us', 'rekap');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '6281234560377@c.us', 'absensi');
  expect(mockSafeSend).toHaveBeenCalledWith({}, '6281234560377@c.us', 'rekap');
  expect(mockSafeSend).toHaveBeenCalledTimes(4);
});

