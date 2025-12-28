import { jest } from '@jest/globals';

const mockCreateRequest = jest.fn();
const mockFindLatestPendingByUsername = jest.fn();
const mockFindById = jest.fn();
const mockFindByUsername = jest.fn();
const mockUpdateStatus = jest.fn();
const mockInsertAuditLog = jest.fn();
const mockCreateSubscription = jest.fn();

jest.unstable_mockModule('../src/model/dashboardPremiumRequestModel.js', () => ({
  createRequest: mockCreateRequest,
  findLatestPendingByUsername: mockFindLatestPendingByUsername,
  updateStatus: mockUpdateStatus,
  insertAuditLog: mockInsertAuditLog,
}));

jest.unstable_mockModule('../src/model/dashboardUserModel.js', () => ({
  findById: mockFindById,
  findByUsername: mockFindByUsername,
}));

jest.unstable_mockModule('../src/service/dashboardSubscriptionService.js', () => ({
  createSubscription: mockCreateSubscription,
}));

let service;

beforeAll(async () => {
  service = await import('../src/service/dashboardPremiumRequestService.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('approvePendingRequest approves pending request and creates subscription', async () => {
  mockFindLatestPendingByUsername.mockResolvedValue({
    request_id: 10,
    dashboard_user_id: 'dashboard-user-1',
    username: 'jane',
    whatsapp: '628123',
    status: 'pending',
  });
  mockFindById.mockResolvedValue({
    dashboard_user_id: 'dashboard-user-1',
    username: 'jane',
    whatsapp: '628123',
  });
  mockCreateSubscription.mockResolvedValue({
    subscription: { subscription_id: 'sub-10', expires_at: '2025-02-01T00:00:00.000Z' },
    cache: { premium_status: true, premium_expires_at: '2025-02-01T00:00:00.000Z' },
  });
  mockUpdateStatus.mockResolvedValue({
    request_id: 10,
    status: 'approved',
  });
  mockInsertAuditLog.mockResolvedValue({ audit_id: 1 });

  const result = await service.approvePendingRequest({
    username: 'jane',
    adminWhatsapp: '62001',
    adminChatId: '62001@c.us',
  });

  expect(result.status).toBe('approved');
  expect(result.request.request_id).toBe(10);
  expect(result.subscription.subscription_id).toBe('sub-10');
  expect(result.cache.premium_status).toBe(true);
  expect(result.applicantWhatsapp).toBe('628123');
  expect(mockUpdateStatus).toHaveBeenCalledWith(10, 'approved');
  expect(mockInsertAuditLog).toHaveBeenCalledWith({
    requestId: 10,
    action: 'approved',
    adminWhatsapp: '62001',
    adminChatId: '62001@c.us',
    note: expect.stringContaining('WA'),
  });
});

test('rejectPendingRequest updates status and logs audit', async () => {
  mockFindLatestPendingByUsername.mockResolvedValue({
    request_id: 20,
    dashboard_user_id: 'dashboard-user-2',
    username: 'mark',
    status: 'pending',
  });
  mockFindById.mockResolvedValue({
    dashboard_user_id: 'dashboard-user-2',
    username: 'mark',
  });
  mockUpdateStatus.mockResolvedValue({
    request_id: 20,
    status: 'rejected',
  });
  mockInsertAuditLog.mockResolvedValue({ audit_id: 2 });

  const result = await service.rejectPendingRequest({
    username: 'mark',
    adminWhatsapp: '62002',
    adminChatId: '62002@c.us',
  });

  expect(result.status).toBe('rejected');
  expect(result.request.request_id).toBe(20);
  expect(mockUpdateStatus).toHaveBeenCalledWith(20, 'rejected');
  expect(mockInsertAuditLog).toHaveBeenCalledWith({
    requestId: 20,
    action: 'rejected',
    adminWhatsapp: '62002',
    adminChatId: '62002@c.us',
    note: 'Rejected via WA',
  });
});

test('rejectPendingRequest returns not_found when no pending request exists', async () => {
  mockFindLatestPendingByUsername.mockResolvedValue(null);

  const result = await service.rejectPendingRequest({ username: 'unknown' });

  expect(result.status).toBe('not_found');
  expect(mockUpdateStatus).not.toHaveBeenCalled();
});
