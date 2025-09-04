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

jest.unstable_mockModule('whatsapp-web.js', () => ({
  default: {
    Client: jest.fn(() => mockClient),
    LocalAuth: jest.fn().mockImplementation(() => ({})),
    MessageMedia,
  },
}));

const { createWwebjsClient } = await import('../src/service/wwebjsAdapter.js');

beforeEach(() => {
  jest.clearAllMocks();
});

test('wwebjs adapter relays messages', async () => {
  const client = await createWwebjsClient();
  const onMessage = jest.fn();
  client.onMessage(onMessage);
  await client.connect();
  const incoming = { from: '123', body: 'hi', id: { id: 'm1', _serialized: 'm1' } };
  listeners['message'](incoming);
  expect(onMessage).toHaveBeenCalledWith(incoming);
  const id = await client.sendMessage('123', 'hello');
  expect(id).toBe('abc');
  expect(mockClient.sendMessage).toHaveBeenCalledWith('123', 'hello', {});
  await client.disconnect();
  expect(mockClient.destroy).toHaveBeenCalled();
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
  });
});

