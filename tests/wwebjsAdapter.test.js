import { jest } from '@jest/globals';

const listeners = {};
const mockClient = {
  on: jest.fn((event, handler) => {
    listeners[event] = handler;
  }),
  initialize: jest.fn().mockResolvedValue(),
  destroy: jest.fn().mockResolvedValue(),
  sendMessage: jest.fn().mockResolvedValue({ id: { id: 'abc' } }),
  getState: jest.fn().mockResolvedValue('CONNECTED'),
  info: {},
};

const MessageMedia = jest.fn();
const ClientMock = jest.fn(() => mockClient);
const LocalAuthMock = jest.fn().mockImplementation(() => ({}));

jest.unstable_mockModule('whatsapp-web.js', () => ({
  default: {
    Client: ClientMock,
    LocalAuth: LocalAuthMock,
    MessageMedia,
  },
}));

const { createWwebjsClient } = await import('../src/service/wwebjsAdapter.js');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WA_WEB_VERSION;
  delete process.env.WA_WEB_VERSION_CACHE_URL;
});

test('wwebjs adapter relays messages', async () => {
  const client = await createWwebjsClient();
  const onMessage = jest.fn();
  const onAuthenticated = jest.fn();
  const onStateChange = jest.fn();
  const onAuthFailure = jest.fn();
  client.onMessage(onMessage);
  client.on('authenticated', onAuthenticated);
  client.on('change_state', onStateChange);
  client.on('auth_failure', onAuthFailure);
  await client.connect();
  const incoming = {
    from: '123',
    body: 'hi',
    id: { id: 'm1', _serialized: 'm1' },
    fromMe: false,
    isStatus: false,
  };
  listeners['message'](incoming);
  expect(onMessage).toHaveBeenCalledWith(expect.objectContaining(incoming));
  listeners['authenticated']({ session: 'ok' });
  listeners['change_state']('CONNECTED');
  await listeners['auth_failure']('invalid');
  expect(onAuthenticated).toHaveBeenCalledWith({ session: 'ok' });
  expect(onStateChange).toHaveBeenCalledWith('CONNECTED');
  expect(onAuthFailure).toHaveBeenCalledWith('invalid');
  const id = await client.sendMessage('123', 'hello');
  expect(id).toBe('abc');
  expect(mockClient.sendMessage).toHaveBeenCalledWith('123', 'hello', {
    sendSeen: false,
  });
  await client.disconnect();
  expect(mockClient.destroy).toHaveBeenCalled();
});

test('wwebjs adapter configures web version cache and overrides', async () => {
  process.env.WA_WEB_VERSION_CACHE_URL = 'https://example.com/wa.json';
  process.env.WA_WEB_VERSION = '2.3000.0';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ version: '2.3000.0' }),
  });

  await createWwebjsClient('custom-client');

  expect(ClientMock).toHaveBeenCalledWith(
    expect.objectContaining({
      authStrategy: expect.anything(),
      puppeteer: expect.objectContaining({ args: ['--no-sandbox'], headless: true }),
      webVersionCache: { type: 'remote', remotePath: 'https://example.com/wa.json' },
      webVersion: '2.3000.0',
    })
  );
  expect(LocalAuthMock).toHaveBeenCalledWith(
    expect.objectContaining({ clientId: 'custom-client' })
  );
});

test('wwebjs adapter sends documents as MessageMedia', async () => {
  MessageMedia.mockImplementation(function (mimetype, data, filename) {
    this.mimetype = mimetype;
    this.data = data;
    this.filename = filename;
  });
  const client = await createWwebjsClient();
  await client.connect();
  const buffer = Buffer.from('file');
  await client.sendMessage('123', {
    document: buffer,
    mimetype: 'text/plain',
    fileName: 'file.txt',
  });
  expect(MessageMedia).toHaveBeenCalledWith(
    'text/plain',
    buffer.toString('base64'),
    'file.txt'
  );
  const mediaInstance = MessageMedia.mock.instances[0];
  expect(mockClient.sendMessage).toHaveBeenCalledWith('123', mediaInstance, {
    sendMediaAsDocument: true,
    sendSeen: false,
  });
});
