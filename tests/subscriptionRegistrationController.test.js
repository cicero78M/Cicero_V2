import { jest } from '@jest/globals';

const mockCreateRegistration = jest.fn();
const mockFindPending = jest.fn();
const mockSendMessage = jest.fn();

jest.unstable_mockModule('../src/service/subscriptionRegistrationService.js', () => ({
  createRegistration: mockCreateRegistration,
  findPendingByUsername: mockFindPending,
}));

jest.unstable_mockModule('../src/service/waService.js', () => ({
  default: { sendMessage: mockSendMessage }
}));

jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  getAdminWAIds: () => ['admin1@c.us', 'admin2@c.us']
}));

let createRegistration;

beforeAll(async () => {
  const mod = await import('../src/controller/subscriptionRegistrationController.js');
  createRegistration = mod.createRegistration;
});

beforeEach(() => {
  mockCreateRegistration.mockReset();
  mockFindPending.mockReset();
  mockSendMessage.mockReset();
  mockSendMessage.mockResolvedValue();
});

test('sends WhatsApp notification when registration created', async () => {
  mockFindPending.mockResolvedValueOnce(null);
  mockCreateRegistration.mockResolvedValueOnce({ registration_id: 1, username: 'user', amount: 50 });
  const req = { body: { username: 'user', amount: 50 } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();

  await createRegistration(req, res, next);

  expect(res.status).toHaveBeenCalledWith(201);
  expect(mockCreateRegistration).toHaveBeenCalledWith(req.body);
  expect(mockSendMessage).toHaveBeenCalledTimes(2);
  expect(mockSendMessage).toHaveBeenCalledWith('admin1@c.us', expect.any(String));
  expect(mockSendMessage).toHaveBeenCalledWith('admin2@c.us', expect.any(String));
});

test('returns 400 when pending registration exists', async () => {
  mockFindPending.mockResolvedValueOnce({ registration_id: 2 });
  const req = { body: { username: 'user' } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();

  await createRegistration(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockCreateRegistration).not.toHaveBeenCalled();
});
