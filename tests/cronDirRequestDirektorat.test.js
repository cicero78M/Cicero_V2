import { jest } from '@jest/globals';

const mockAbsensi = jest.fn();
const mockKomentar = jest.fn();
const mockSafeSend = jest.fn();
const mockSendDebug = jest.fn();
const mockBuildClientRecipientSet = jest.fn();
const mockFindActiveDirektorat = jest.fn();

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
jest.unstable_mockModule('../src/model/clientModel.js', () => ({
  findAllActiveDirektoratWithSosmed: mockFindActiveDirektorat,
}));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronDirRequestDirektorat.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAbsensi.mockResolvedValue('absensi');
  mockKomentar.mockResolvedValue('komentar');
  mockFindActiveDirektorat.mockResolvedValue([
    { client_id: 'DIT1' },
    { client_id: 'DIT2' },
  ]);
  mockBuildClientRecipientSet.mockImplementation(async (_, { includeSuper, includeGroup }) => {
    const recipients = new Set();
    if (includeSuper) recipients.add('super@c.us');
    if (includeGroup) recipients.add('group@g.us');
    return { recipients, hasClientRecipients: recipients.size > 0 };
  });
});

test('runCron sends absensi and komentar sequentially to each eligible directorate super admin', async () => {
  await runCron();

  expect(mockFindActiveDirektorat).toHaveBeenCalledTimes(1);
  expect(mockAbsensi).toHaveBeenNthCalledWith(1, 'DIT1');
  expect(mockAbsensi).toHaveBeenNthCalledWith(2, 'DIT2');
  expect(mockKomentar).toHaveBeenNthCalledWith(1, 'DIT1');
  expect(mockKomentar).toHaveBeenNthCalledWith(2, 'DIT2');

  expect(mockBuildClientRecipientSet).toHaveBeenCalledWith('DIT1', {
    includeAdmins: false,
    includeOperator: false,
    includeGroup: false,
    includeSuper: true,
  });
  expect(mockBuildClientRecipientSet).toHaveBeenCalledWith('DIT2', {
    includeAdmins: false,
    includeOperator: false,
    includeGroup: false,
    includeSuper: true,
  });

  expect(mockSafeSend).toHaveBeenCalledWith({}, 'super@c.us', 'absensi');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'super@c.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledTimes(4);
});

test('runCron uses provided client IDs and skips database lookup', async () => {
  mockFindActiveDirektorat.mockResolvedValue([]);

  await runCron({ clientIds: ['CUSTOM'] });

  expect(mockFindActiveDirektorat).not.toHaveBeenCalled();
  expect(mockAbsensi).toHaveBeenCalledWith('CUSTOM');
  expect(mockKomentar).toHaveBeenCalledWith('CUSTOM');
});

test('runCron logs when no eligible directorate clients found', async () => {
  mockFindActiveDirektorat.mockResolvedValue([]);

  await runCron();

  expect(mockSendDebug).toHaveBeenCalledWith(
    expect.objectContaining({
      msg: 'Tidak ada client direktorat aktif dengan Instagram dan TikTok yang siap diproses',
    })
  );
});

test('runCron sends BIDHUMAS night recap to group and super admin by default', async () => {
  mockFindActiveDirektorat.mockResolvedValue([{ client_id: 'BIDHUMAS' }]);

  await runCron();

  expect(mockBuildClientRecipientSet).toHaveBeenCalledWith('BIDHUMAS', {
    includeAdmins: false,
    includeOperator: false,
    includeGroup: true,
    includeSuper: true,
  });
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'super@c.us', 'absensi');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'super@c.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'group@g.us', 'absensi');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'group@g.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledTimes(4);
});

test('runCron can target BIDHUMAS group-only schedules', async () => {
  await runCron({ clientIds: ['BIDHUMAS'], recipientMode: 'groupOnly' });

  expect(mockBuildClientRecipientSet).toHaveBeenCalledWith('BIDHUMAS', {
    includeAdmins: false,
    includeOperator: false,
    includeGroup: true,
    includeSuper: false,
  });
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'group@g.us', 'absensi');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'group@g.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledTimes(2);
});

test('runCron can target BIDHUMAS group-and-super schedules', async () => {
  await runCron({ clientIds: ['BIDHUMAS'], recipientMode: 'groupAndSuper' });

  expect(mockBuildClientRecipientSet).toHaveBeenCalledWith('BIDHUMAS', {
    includeAdmins: false,
    includeOperator: false,
    includeGroup: true,
    includeSuper: true,
  });
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'super@c.us', 'absensi');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'super@c.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'group@g.us', 'absensi');
  expect(mockSafeSend).toHaveBeenCalledWith({}, 'group@g.us', 'komentar');
  expect(mockSafeSend).toHaveBeenCalledTimes(4);
});

