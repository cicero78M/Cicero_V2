import { jest } from '@jest/globals';

const mockRequestPairingCode = jest.fn().mockResolvedValue('654321');
const mockEnd = jest.fn().mockResolvedValue();
const mockSock = { requestPairingCode: mockRequestPairingCode, ev: { on: jest.fn() }, end: mockEnd };

jest.unstable_mockModule('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn(() => mockSock),
  useMultiFileAuthState: jest.fn().mockResolvedValue({ state: {}, saveCreds: jest.fn() }),
}));

const { requestPairingCode } = await import('../src/service/waAdapter.js');

test('requestPairingCode requests code and closes socket', async () => {
  const code = await requestPairingCode('0895601093339');
  expect(mockRequestPairingCode).toHaveBeenCalledWith('0895601093339');
  expect(code).toBe('654321');
  expect(mockEnd).toHaveBeenCalled();
});
