import { jest } from '@jest/globals';

const mockGenerateKasatkerReport = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockSendDebug = jest.fn();
const mockBuildClientRecipientSet = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({
  waGatewayClient: { id: 'gateway' },
}));

jest.unstable_mockModule('../src/service/kasatkerReportService.js', () => ({
  generateKasatkerReport: mockGenerateKasatkerReport,
}));

jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  safeSendMessage: mockSafeSendMessage,
}));

jest.unstable_mockModule('../src/utils/recipientHelper.js', () => ({
  buildClientRecipientSet: mockBuildClientRecipientSet,
}));

jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

let runDailyReport;
let runWeeklyReport;
let runMonthlyReport;
let isLastDayOfMonthJakarta;

beforeEach(async () => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  mockGenerateKasatkerReport.mockResolvedValue(' Narasi Kasatker ');
  mockSafeSendMessage.mockResolvedValue(true);
  mockBuildClientRecipientSet.mockResolvedValue({
    recipients: new Set(['111@c.us', '222@c.us']),
    hasClientRecipients: true,
  });

  ({
    runDailyReport,
    runWeeklyReport,
    runMonthlyReport,
    isLastDayOfMonthJakarta,
  } = await import('../src/cron/cronDirRequestLapharKasatker.js'));
});

test('runDailyReport generates and sends harian report', async () => {
  const result = await runDailyReport();

  expect(mockGenerateKasatkerReport).toHaveBeenCalledWith({
    clientId: 'DITBINMAS',
    roleFlag: 'ditbinmas',
    period: 'today',
  });
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    { id: 'gateway' },
    '111@c.us',
    'Narasi Kasatker'
  );
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    { id: 'gateway' },
    '222@c.us',
    'Narasi Kasatker'
  );
  expect(result).toBe(true);
});

test('runWeeklyReport generates and sends weekly report', async () => {
  await runWeeklyReport();

  expect(mockGenerateKasatkerReport).toHaveBeenCalledWith({
    clientId: 'DITBINMAS',
    roleFlag: 'ditbinmas',
    period: 'this_week',
  });
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    { id: 'gateway' },
    '111@c.us',
    'Narasi Kasatker'
  );
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    { id: 'gateway' },
    '222@c.us',
    'Narasi Kasatker'
  );
});

test('runMonthlyReport skips when not last day in Jakarta timezone', async () => {
  const date = new Date('2024-01-30T12:00:00+07:00');
  const result = await runMonthlyReport(date);

  expect(result).toBe(false);
  expect(mockGenerateKasatkerReport).not.toHaveBeenCalled();
  expect(mockSafeSendMessage).not.toHaveBeenCalled();
  expect(mockSendDebug).toHaveBeenCalledWith({
    tag: 'CRON DIRREQ KASATKER',
    msg: 'Lewati laporan bulanan karena belum akhir bulan',
  });
});

test('runMonthlyReport sends report on last day of month in Jakarta timezone', async () => {
  const date = new Date('2024-01-31T12:00:00+07:00');
  const result = await runMonthlyReport(date);

  expect(result).toBe(true);
  expect(mockGenerateKasatkerReport).toHaveBeenCalledWith({
    clientId: 'DITBINMAS',
    roleFlag: 'ditbinmas',
    period: 'this_month',
  });
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    { id: 'gateway' },
    '111@c.us',
    'Narasi Kasatker'
  );
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    { id: 'gateway' },
    '222@c.us',
    'Narasi Kasatker'
  );
});

test('isLastDayOfMonthJakarta respects Asia/Jakarta timezone boundaries', () => {
  const almostMidnightJakarta = new Date('2024-02-29T23:00:00+07:00');
  const justAfterMidnightJakarta = new Date('2024-03-01T00:30:00+07:00');

  expect(isLastDayOfMonthJakarta(almostMidnightJakarta)).toBe(true);
  expect(isLastDayOfMonthJakarta(justAfterMidnightJakarta)).toBe(false);
});
