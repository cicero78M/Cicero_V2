import { jest } from '@jest/globals';

const scheduleCronJob = jest.fn((jobKey, cronExpression, handler, options) => {
  scheduledJobs.push({ jobKey, cronExpression, handler, options });
  return { jobKey, cronExpression, handler };
});

const sendDebug = jest.fn();
const safeSendMessage = jest.fn();
const runDirRequestAction = jest.fn();
const findClientById = jest.fn(async () => ({
  client_group: '120363025123456789@g.us',
  client_super: '08123456789',
  client_operator: '081987654321',
}));
const splitRecipientField = jest.fn((value) => (value ? value.split(',') : []));
const normalizeGroupId = jest.fn((value) => value);
const minPhoneDigitLength = 8;
const normalizeUserWhatsAppId = (value, minLength = minPhoneDigitLength) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < minLength) return null;
  const normalized = digits.startsWith('62') ? digits : `62${digits.replace(/^0/, '')}`;
  return `${normalized}@c.us`;
};

const waGatewayClient = {
  on: jest.fn((event, cb) => {
    if (event === 'ready') {
      cb();
    }
  }),
  waitForWaReady: jest.fn(() => Promise.resolve()),
};

const originalJestWorkerId = process.env.JEST_WORKER_ID;
let scheduledJobs = [];

afterAll(() => {
  process.env.JEST_WORKER_ID = originalJestWorkerId;
});

beforeEach(() => {
  jest.resetModules();
  scheduledJobs = [];
  scheduleCronJob.mockClear();
  sendDebug.mockClear();
  safeSendMessage.mockClear();
  runDirRequestAction.mockClear();
  findClientById.mockClear();
  splitRecipientField.mockClear();
  normalizeGroupId.mockClear();
  process.env.JEST_WORKER_ID = undefined;
});

async function loadModules() {
  jest.unstable_mockModule('../src/config/env.js', () => ({
    env: { ENABLE_DIRREQUEST_GROUP: true },
  }));

  jest.unstable_mockModule('../src/utils/cronScheduler.js', () => ({
    scheduleCronJob,
  }));

  jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
    sendDebug,
  }));

  jest.unstable_mockModule('../src/handler/menu/dirRequestHandlers.js', () => ({
    runDirRequestAction,
  }));

  jest.unstable_mockModule('../src/service/clientService.js', () => ({
    findClientById,
  }));

  jest.unstable_mockModule('../src/repository/clientContactRepository.js', () => ({
    splitRecipientField,
  }));

  jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
    safeSendMessage,
    getAdminWAIds: () => [],
    normalizeUserWhatsAppId,
    minPhoneDigitLength,
  }));

  jest.unstable_mockModule('../src/service/waService.js', () => ({
    waGatewayClient,
  }));

  jest.unstable_mockModule('../src/cron/cronDirRequestFetchSosmed.js', () => ({
    runCron: jest.fn(),
    JOB_KEY: 'fetch-job',
    normalizeGroupId,
  }));

  jest.unstable_mockModule('../src/cron/cronWaNotificationReminder.js', () => ({
    runCron: jest.fn(),
    JOB_KEY: 'reminder-job',
  }));

  jest.unstable_mockModule('../src/cron/cronDirRequestSatbinmasOfficialMedia.js', () => ({
    runCron: jest.fn(),
    JOB_KEY: 'satbinmas-job',
  }));

  jest.unstable_mockModule('../src/cron/cronDirRequestBidhumasEvening.js', () => ({
    runCron: jest.fn(),
    JOB_KEY: 'bidhumas-evening-job',
  }));

  const dirRequest = await import('../src/cron/dirRequest/index.js');
  const customSequence = await import('../src/cron/cronDirRequestCustomSequence.js');

  return {
    registerDirRequestCrons: dirRequest.registerDirRequestCrons,
    DIRREQUEST_CUSTOM_SEQUENCE_JOB_KEY: customSequence.JOB_KEY,
    DITBINMAS_RECAP_AND_CUSTOM_JOB_KEY: customSequence.DITBINMAS_RECAP_AND_CUSTOM_JOB_KEY,
    BIDHUMAS_2030_JOB_KEY: customSequence.BIDHUMAS_2030_JOB_KEY,
  };
}

test('registerDirRequestCrons schedules custom and combined Ditbinmas recap at 20:30', async () => {
  const {
    registerDirRequestCrons,
    DIRREQUEST_CUSTOM_SEQUENCE_JOB_KEY,
    DITBINMAS_RECAP_AND_CUSTOM_JOB_KEY,
  } = await loadModules();

  registerDirRequestCrons(waGatewayClient);

  const jobsAt2030 = scheduledJobs.filter((job) => job.cronExpression === '30 20 * * *');

  expect(jobsAt2030.map((job) => job.jobKey)).toEqual([
    DIRREQUEST_CUSTOM_SEQUENCE_JOB_KEY,
    DITBINMAS_RECAP_AND_CUSTOM_JOB_KEY,
  ]);
});

test('20:30 Ditbinmas recap + custom job runs Ditbinmas recap before custom sequence', async () => {
  const { registerDirRequestCrons, DITBINMAS_RECAP_AND_CUSTOM_JOB_KEY } = await loadModules();

  registerDirRequestCrons(waGatewayClient);

  const combinedJob = scheduledJobs.find((job) => job.jobKey === DITBINMAS_RECAP_AND_CUSTOM_JOB_KEY);
  expect(combinedJob).toBeDefined();

  await combinedJob.handler();

  expect(runDirRequestAction).toHaveBeenCalledWith(
    expect.objectContaining({ clientId: 'DITBINMAS', action: '6' }),
  );
  expect(runDirRequestAction).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'BIDHUMAS' }));
});

test('Ditbinmas recap job schedules super admin and operator actions', async () => {
  const { registerDirRequestCrons, DITBINMAS_RECAP_AND_CUSTOM_JOB_KEY } = await loadModules();

  registerDirRequestCrons(waGatewayClient);

  const recapSlots = scheduledJobs.filter((job) => job.cronExpression === '33 20 * * *');
  expect(recapSlots).toHaveLength(1);
  expect(recapSlots[0]?.jobKey).toBe(DITBINMAS_RECAP_AND_CUSTOM_JOB_KEY);

  const ditbinmasRecapJob = recapSlots[0];

  await ditbinmasRecapJob.handler();

  expect(runDirRequestAction).toHaveBeenCalledWith(
    expect.objectContaining({ clientId: 'DITBINMAS', action: '6' }),
  );
  expect(runDirRequestAction).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'DITBINMAS', action: '30' }));
});
