import { jest } from '@jest/globals';

const mockSchedule = jest.fn();
const mockGetCronJob = jest.fn();

jest.unstable_mockModule('node-cron', () => ({
  default: {
    schedule: mockSchedule,
  },
}));

jest.unstable_mockModule('../../src/service/cronJobConfigService.js', () => ({
  getCronJob: mockGetCronJob,
}));

let scheduleCronJob;

beforeAll(async () => {
  ({ scheduleCronJob } = await import('../../src/utils/cronScheduler.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('skips executing handler when job is inactive', async () => {
  const handler = jest.fn();
  let scheduledHandler;
  mockSchedule.mockImplementation((expr, callback) => {
    scheduledHandler = callback;
    return { stop: jest.fn() };
  });
  mockGetCronJob.mockResolvedValue({ job_key: 'job1', is_active: false });

  scheduleCronJob('job1', '* * * * *', handler);
  await scheduledHandler();

  expect(mockGetCronJob).toHaveBeenCalledWith('job1');
  expect(handler).not.toHaveBeenCalled();
});

test('executes handler when job is active', async () => {
  const handler = jest.fn().mockResolvedValue();
  let scheduledHandler;
  mockSchedule.mockImplementation((expr, callback) => {
    scheduledHandler = callback;
    return { stop: jest.fn() };
  });
  mockGetCronJob.mockResolvedValue({ job_key: 'job1', is_active: true });

  scheduleCronJob('job1', '* * * * *', handler);
  await scheduledHandler('foo');

  expect(handler).toHaveBeenCalledWith('foo');
});
