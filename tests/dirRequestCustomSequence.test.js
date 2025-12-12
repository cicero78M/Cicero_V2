import { jest } from '@jest/globals';

const sendDebug = jest.fn();
const safeSendMessage = jest.fn();
const runDirRequestAction = jest.fn();
const findClientById = jest.fn(async () => ({
  client_group: '120363025123456789@g.us',
  client_super: '08123456789',
  client_operator: '081987654321',
  client_status: true,
  client_type: 'direktorat',
}));
const splitRecipientField = jest.fn((value) => (value ? value.split(',') : []));
const normalizeGroupId = jest.fn((value) => value);
const runDirRequestFetchSosmed = jest.fn(async () => {});
const delayAfterSend = jest.fn(async () => {});

const originalExtraActions = process.env.DITSAMAPTA_EXTRA_ACTIONS;

afterAll(() => {
  process.env.DITSAMAPTA_EXTRA_ACTIONS = originalExtraActions;
});

beforeEach(() => {
  jest.resetModules();
  sendDebug.mockClear();
  safeSendMessage.mockClear();
  runDirRequestAction.mockClear();
  findClientById.mockClear();
  splitRecipientField.mockClear();
  normalizeGroupId.mockClear();
  runDirRequestFetchSosmed.mockClear();
  delayAfterSend.mockClear();
  process.env.DITSAMAPTA_EXTRA_ACTIONS = '';
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
    normalizeGroupId,
    runCron: runDirRequestFetchSosmed,
  }));

  jest.unstable_mockModule('../src/cron/dirRequestThrottle.js', () => ({
    delayAfterSend,
  }));

  const module = await import('../src/cron/cronDirRequestCustomSequence.js');
  return { runCron: module.runCron, runBidhumasMenuSequence: module.runBidhumasMenuSequence };
}

test('runCron dispatches DITSAMAPTA menus including 28 and 29', async () => {
  const { runCron } = await loadModules();

  await runCron();

  expect(runDirRequestFetchSosmed).toHaveBeenCalled();

  const ditsamaptaActions = runDirRequestAction.mock.calls
    .filter(([args]) => args.clientId === 'DITSAMAPTA')
    .map(([args]) => args.action);

  expect(ditsamaptaActions).toEqual(expect.arrayContaining(['6', '9', '28', '29']));
});

test('runBidhumasMenuSequence includes recap menus 28 and 29', async () => {
  const { runBidhumasMenuSequence } = await loadModules();

  await runBidhumasMenuSequence();

  const bidhumasActions = runDirRequestAction.mock.calls
    .filter(([args]) => args.clientId === 'BIDHUMAS')
    .map(([args]) => args.action);

  expect(bidhumasActions).toEqual(expect.arrayContaining(['6', '9', '28', '29']));
});
