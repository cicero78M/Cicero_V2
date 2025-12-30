import { jest } from '@jest/globals';

const mockFindByIdWithSessionSettings = jest.fn();
const mockCreatePremiumAccessRequest = jest.fn();

jest.unstable_mockModule('../src/model/dashboardUserModel.js', () => ({
  findByIdWithSessionSettings: mockFindByIdWithSessionSettings,
}));

jest.unstable_mockModule('../src/service/dashboardPremiumRequestService.js', () => ({
  createPremiumAccessRequest: mockCreatePremiumAccessRequest,
}));

let controller;

beforeAll(async () => {
  controller = await import('../src/controller/dashboardPremiumRequestController.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('createDashboardPremiumRequest rejects body dashboard_user_id override', async () => {
  const req = {
    dashboardUser: {
      dashboard_user_id: 'token-db-user',
      client_ids: ['client-1'],
    },
    body: {
      dashboard_user_id: 'other-user',
      bank_name: 'Bank A',
      account_number: '123',
      sender_name: 'Sender',
      transfer_amount: 1000,
      client_id: 'client-1',
      username: 'tester',
    },
  };

  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();

  await controller.createDashboardPremiumRequest(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockFindByIdWithSessionSettings).not.toHaveBeenCalled();
  expect(mockCreatePremiumAccessRequest).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

test('createDashboardPremiumRequest loads dashboard user from DB and forwards it to the service', async () => {
  const req = {
    dashboardUser: {
      dashboard_user_id: 'token-db-user',
      client_ids: ['client-1'],
      client_id: 'client-1',
      username: 'db-user',
    },
    body: {
      bank_name: 'Bank A',
      account_number: '123',
      sender_name: 'Sender',
      transfer_amount: 1000,
      client_id: 'client-1',
      username: 'db-user',
    },
  };

  const dbDashboardUser = {
    dashboard_user_id: 'token-db-user',
    username: 'db-user',
    whatsapp: '08123',
    client_ids: ['client-1'],
    user_uuid: 'uuid-db',
  };

  mockFindByIdWithSessionSettings.mockResolvedValue(dbDashboardUser);
  mockCreatePremiumAccessRequest.mockResolvedValue({
    request: { request_id: 'req-1' },
    notification: { sent: true },
  });

  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();

  await controller.createDashboardPremiumRequest(req, res, next);

  expect(mockFindByIdWithSessionSettings).toHaveBeenCalledWith(
    'token-db-user',
    expect.objectContaining({
      'app.current_dashboard_user_id': 'token-db-user',
    }),
  );
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith({
    success: true,
    data: { request: { request_id: 'req-1' }, notification: { sent: true } },
  });
  expect(next).not.toHaveBeenCalled();
  expect(mockCreatePremiumAccessRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      dashboardUser: expect.objectContaining({
        dashboard_user_id: 'token-db-user',
        username: 'db-user',
        whatsapp: '08123',
        user_uuid: 'uuid-db',
      }),
      username: 'db-user',
      sessionContext: expect.objectContaining({
        dashboardUserId: 'token-db-user',
        userUuid: 'uuid-db',
      }),
    }),
  );
});

test('createDashboardPremiumRequest rejects when dashboard user lookup fails', async () => {
  const req = {
    dashboardUser: {
      dashboard_user_id: 'token-db-user',
      client_ids: ['client-1'],
      client_id: 'client-1',
      username: 'db-user',
    },
    body: {
      bank_name: 'Bank A',
      account_number: '123',
      sender_name: 'Sender',
      transfer_amount: 1000,
      client_id: 'client-1',
      username: 'db-user',
    },
  };

  mockFindByIdWithSessionSettings.mockResolvedValue(null);

  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();

  await controller.createDashboardPremiumRequest(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockCreatePremiumAccessRequest).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

test('createDashboardPremiumRequest normalizes blank dashboard_user_id from token', async () => {
  const req = {
    dashboardUser: {
      dashboard_user_id: '   ',
      client_ids: ['client-1'],
    },
    body: {
      bank_name: 'Bank A',
      account_number: '123',
      sender_name: 'Sender',
      transfer_amount: 1000,
      client_id: 'client-1',
      username: 'db-user',
    },
  };

  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();

  await controller.createDashboardPremiumRequest(req, res, next);

  expect(res.status).toHaveBeenCalledWith(401);
  expect(mockFindByIdWithSessionSettings).not.toHaveBeenCalled();
  expect(mockCreatePremiumAccessRequest).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

test('createDashboardPremiumRequest ignores empty dashboard_user_id in body and uses DB data', async () => {
  const req = {
    dashboardUser: {
      dashboard_user_id: 'token-db-user',
      client_ids: ['client-1'],
      client_id: 'client-1',
      username: 'db-user',
    },
    body: {
      dashboard_user_id: '   ',
      bank_name: 'Bank A',
      account_number: '123',
      sender_name: 'Sender',
      transfer_amount: 1000,
      client_id: 'client-1',
      username: 'db-user',
    },
  };

  const dbDashboardUser = {
    dashboard_user_id: 'token-db-user',
    username: 'db-user',
    whatsapp: ' 08123 ',
    client_ids: ['client-1'],
    user_uuid: 'uuid-db',
  };

  mockFindByIdWithSessionSettings.mockResolvedValue(dbDashboardUser);
  mockCreatePremiumAccessRequest.mockResolvedValue({
    request: { request_id: 'req-2' },
    notification: { sent: true },
  });

  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();

  await controller.createDashboardPremiumRequest(req, res, next);

  expect(res.status).toHaveBeenCalledWith(201);
  expect(mockCreatePremiumAccessRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      dashboardUser: expect.objectContaining({
        dashboard_user_id: 'token-db-user',
        whatsapp: '08123',
      }),
    }),
  );
  expect(res.json).toHaveBeenCalledWith({
    success: true,
    data: { request: { request_id: 'req-2' }, notification: { sent: true } },
  });
  expect(next).not.toHaveBeenCalled();
});
