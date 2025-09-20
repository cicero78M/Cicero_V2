import { jest } from '@jest/globals';
import { tmpdir } from 'os';
import { join, basename } from 'path';
import { writeFile, access } from 'fs/promises';

const mockSaveEngagementRankingExcel = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockSendWAFile = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({ waGatewayClient: {} }));
jest.unstable_mockModule('../src/service/engagementRankingExcelService.js', () => ({
  saveEngagementRankingExcel: mockSaveEngagementRankingExcel,
}));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  safeSendMessage: mockSafeSendMessage,
  sendWAFile: mockSendWAFile,
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronDirRequestEngageRank.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSafeSendMessage.mockResolvedValue(true);
  mockSendWAFile.mockResolvedValue();
});

test('runCron generates excel, sends narrative and file, then cleans up', async () => {
  const filePath = join(tmpdir(), `engage-rank-${Date.now()}.xlsx`);
  await writeFile(filePath, 'dummy');
  mockSaveEngagementRankingExcel.mockResolvedValue({
    filePath,
    fileName: basename(filePath),
  });

  await runCron();

  expect(mockSaveEngagementRankingExcel).toHaveBeenCalledWith({
    clientId: 'DITBINMAS',
    roleFlag: 'ditbinmas',
  });

  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    {},
    '08127309190@c.us',
    expect.stringContaining('Mengirimkan Ranking Jajaran')
  );

  expect(mockSendWAFile).toHaveBeenCalledWith(
    {},
    expect.any(Buffer),
    basename(filePath),
    ['08127309190@c.us'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  await expect(access(filePath)).rejects.toThrow();

  expect(mockSendDebug).toHaveBeenCalledWith({
    tag: 'CRON DIRREQ ENGAGE RANK',
    msg: 'Mulai cron dirrequest engage rank untuk 08127309190@c.us',
  });
  expect(mockSendDebug).toHaveBeenCalledWith({
    tag: 'CRON DIRREQ ENGAGE RANK',
    msg: 'Laporan ranking engagement dikirim ke 08127309190@c.us',
  });
});

test('runCron can broadcast to multiple recipients', async () => {
  const filePath = join(tmpdir(), `engage-rank-${Date.now()}.xlsx`);
  await writeFile(filePath, 'dummy');
  mockSaveEngagementRankingExcel.mockResolvedValue({
    filePath,
    fileName: basename(filePath),
  });

  const recipients = ['123@g.us', '456@c.us'];

  await runCron({ recipients });

  expect(mockSafeSendMessage).toHaveBeenCalledTimes(recipients.length);
  for (const target of recipients) {
    expect(mockSafeSendMessage).toHaveBeenCalledWith(
      {},
      target,
      expect.any(String)
    );
  }

  expect(mockSendWAFile).toHaveBeenCalledWith(
    {},
    expect.any(Buffer),
    basename(filePath),
    recipients,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});
