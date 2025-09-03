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
  info: {}
};

jest.unstable_mockModule('whatsapp-web.js', () => ({
  Client: jest.fn(() => mockClient),
  LocalAuth: jest.fn().mockImplementation(() => ({})),
}));

const { createWwebjsClient } = await import('../src/service/wwebjsAdapter.js');

test('wwebjs adapter relays messages', async () => {
  const client = await createWwebjsClient();
  const onMessage = jest.fn();
  client.onMessage(onMessage);
  await client.connect();
  listeners['message']({ from: '123', body: 'hi' });
  expect(onMessage).toHaveBeenCalledWith({ from: '123', body: 'hi' });
  const id = await client.sendMessage('123', 'hello');
  expect(id).toBe('abc');
  await client.disconnect();
  expect(mockClient.destroy).toHaveBeenCalled();
});
