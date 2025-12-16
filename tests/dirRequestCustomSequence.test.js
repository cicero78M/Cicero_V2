import { jest } from '@jest/globals';

const sendDebug = jest.fn();
const safeSendMessage = jest.fn();
const runDirRequestAction = jest.fn();
const findClientById = jest.fn(async () => ({
  client_super: '08123456789',
  client_operator: '081987654321',
  client_status: true,
  client_type: 'direktorat',
}));
const splitRecipientField = jest.fn((value) => (value ? value.split(',') : []));
const runDirRequestFetchSosmed = jest.fn(async () => {});
const delayAfterSend = jest.fn(async () => {});

beforeEach(() => {
  jest.resetModules();
  sendDebug.mockClear();
  safeSendMessage.mockClear();
  runDirRequestAction.mockClear();
  findClientById.mockClear();
  splitRecipientField.mockClear();
  runDirRequestFetchSosmed.mockClear();
  delayAfterSend.mockClear();
});

async function loadModules() {
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
  }));

  jest.unstable_mockModule('../src/service/waService.js', () => ({
    waGatewayClient: {},
  }));

  jest.unstable_mockModule('../src/cron/cronDirRequestFetchSosmed.js', () => ({
    runCron: runDirRequestFetchSosmed,
  }));

  jest.unstable_mockModule('../src/cron/dirRequestThrottle.js', () => ({
    delayAfterSend,
  }));

  const module = await import('../src/cron/cronDirRequestCustomSequence.js');
  return { runCron: module.runCron, runDitbinmasRecapSequence: module.runDitbinmasRecapSequence };
}

test('runCron fetches sosmed and dispatches Ditbinmas menus 6/9/30/34/35 only', async () => {
  const { runCron } = await loadModules();

  await runCron();

  expect(runDirRequestFetchSosmed).toHaveBeenCalled();

  const ditbinmasActions = runDirRequestAction.mock.calls
    .filter(([args]) => args.clientId === 'DITBINMAS')
    .map(([args]) => args.action);

  expect(ditbinmasActions).toEqual(expect.arrayContaining(['6', '9', '30', '34', '35']));
  expect(ditbinmasActions).not.toContain('21');
  expect(runDirRequestAction.mock.calls.every(([args]) => args.clientId === 'DITBINMAS')).toBe(true);
});

test('runDitbinmasRecapSequence skips menu 21 and sends operator recap', async () => {
  const { runDitbinmasRecapSequence } = await loadModules();

  await runDitbinmasRecapSequence(new Date('2024-06-03T13:30:00+07:00'));

  const actions = runDirRequestAction.mock.calls.map(([args]) => args.action);
  expect(actions).toEqual(expect.arrayContaining(['6', '9', '30', '34', '35']));
  expect(actions).not.toContain('21');
});
