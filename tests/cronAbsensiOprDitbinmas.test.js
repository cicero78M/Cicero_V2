import { jest } from '@jest/globals';

const mockAbsensi = jest.fn().mockResolvedValue('msg');
const mockSendWAReport = jest.fn();
const mockGetAdminWAIds = jest.fn(() => ['ADMIN']);

jest.unstable_mockModule('../src/handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDitbinmas.js', () => ({
  absensiRegistrasiDashboardDitbinmas: mockAbsensi,
}));
jest.unstable_mockModule('../src/service/waService.js', () => ({ default: {} }));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  sendWAReport: mockSendWAReport,
  getAdminWAIds: mockGetAdminWAIds,
}));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronAbsensiOprDitbinmas.js'));
});

test('runCron sends report to admin', async () => {
  await runCron();
  expect(mockAbsensi).toHaveBeenCalled();
  expect(mockSendWAReport).toHaveBeenCalledWith({}, 'msg', ['ADMIN']);
});
