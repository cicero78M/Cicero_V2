import { jest } from '@jest/globals';

const mockScheduleCronJob = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockFormatToWhatsAppId = jest.fn((digits) => `${digits}@c.us`);
const mockGetActiveUsersWithWhatsapp = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetLikesByShortcode = jest.fn();
const mockGetPostsTodayByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockFindClientById = jest.fn();
const mockNormalizeInsta = jest.fn((username) => (username || '').toLowerCase());

jest.unstable_mockModule('../src/utils/cronScheduler.js', () => ({
  scheduleCronJob: mockScheduleCronJob,
}));

jest.unstable_mockModule('../src/service/waService.js', () => ({
  waGatewayClient: {},
}));

jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  safeSendMessage: mockSafeSendMessage,
  formatToWhatsAppId: mockFormatToWhatsAppId,
}));

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getActiveUsersWithWhatsapp: mockGetActiveUsersWithWhatsapp,
}));

jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
}));

jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getLikesByShortcode: mockGetLikesByShortcode,
}));

jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsTodayByClient: mockGetPostsTodayByClient,
}));

jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getCommentsByVideoId: mockGetCommentsByVideoId,
}));

jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));

jest.unstable_mockModule('../src/utils/likesHelper.js', () => ({
  normalizeUsername: mockNormalizeInsta,
}));

let runCron;
let resetNotificationReminderState;

afterEach(() => {
  jest.clearAllMocks();
});

beforeAll(async () => {
  ({ runCron, resetNotificationReminderState } = await import('../src/cron/cronWaNotificationReminder.js'));
});

beforeEach(() => {
  resetNotificationReminderState();
  mockGetShortcodesTodayByClient.mockResolvedValue([]);
  mockGetLikesByShortcode.mockResolvedValue([]);
  mockGetPostsTodayByClient.mockResolvedValue([]);
  mockGetCommentsByVideoId.mockResolvedValue({ comments: [] });
  mockFindClientById.mockResolvedValue({ client_tiktok: '@ditbinmas' });
});

test('runCron only sends reminders for DITBINMAS users', async () => {
  mockGetActiveUsersWithWhatsapp.mockResolvedValue([
    {
      whatsapp: '081234567890',
      wa_notification_opt_in: true,
      client_id: 'DITBINMAS',
      insta: 'user1',
      tiktok: 'tt1',
      nama: 'User Binmas',
    },
    {
      whatsapp: '089876543210',
      wa_notification_opt_in: true,
      client_id: 'OTHER',
      insta: 'user2',
      tiktok: 'tt2',
      nama: 'User Other',
    },
    {
      whatsapp: '081234567890',
      wa_notification_opt_in: true,
      client_id: 'DITBINMAS',
      insta: 'user1',
      tiktok: 'tt1',
      nama: 'Duplicate Binmas',
    },
  ]);

  await runCron();

  expect(mockGetActiveUsersWithWhatsapp).toHaveBeenCalledTimes(1);
  expect(mockSafeSendMessage).toHaveBeenCalledTimes(1);
  expect(mockSafeSendMessage).toHaveBeenCalledWith({}, '081234567890@c.us', expect.any(String));
  expect(mockGetShortcodesTodayByClient).toHaveBeenCalledWith('DITBINMAS');
  expect(mockGetPostsTodayByClient).toHaveBeenCalledWith('DITBINMAS');
  expect(mockFindClientById).toHaveBeenCalledWith('DITBINMAS');
});

test('runCron sends staged follow-ups for users still incomplete', async () => {
  mockGetActiveUsersWithWhatsapp.mockResolvedValue([
    {
      whatsapp: '081234567890',
      wa_notification_opt_in: true,
      client_id: 'DITBINMAS',
      insta: 'user1',
      tiktok: 'tt1',
      nama: 'User Binmas',
    },
  ]);

  mockGetShortcodesTodayByClient.mockResolvedValue(['abc123']);
  mockGetLikesByShortcode.mockResolvedValue([]);

  await runCron();

  expect(mockSafeSendMessage).toHaveBeenCalledTimes(1);

  mockSafeSendMessage.mockClear();
  mockGetLikesByShortcode.mockResolvedValue(['user1']);

  await runCron();

  expect(mockSafeSendMessage).toHaveBeenCalledTimes(1);

  mockSafeSendMessage.mockClear();

  await runCron();

  expect(mockSafeSendMessage).not.toHaveBeenCalled();
});
