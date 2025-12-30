import { jest } from '@jest/globals';

const mockCreateRequest = jest.fn();
const mockFindLatestPendingByUsername = jest.fn();
const mockUpdateStatus = jest.fn();
const mockUpdateStatusIfPending = jest.fn();
const mockInsertAuditEntry = jest.fn();
const mockCreateSubscription = jest.fn();
const mockFindById = jest.fn();
const mockFindByUsername = jest.fn();

const mockWaitForWaReady = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockFormatToWhatsAppId = jest.fn(value => `wa:${value}`);
const mockGetAdminWAIds = jest.fn(() => ['admin@c.us']);

const mockWaClient = {};

jest.unstable_mockModule('../src/model/dashboardPremiumRequestModel.js', () => ({
  createRequest: mockCreateRequest,
  findLatestPendingByUsername: mockFindLatestPendingByUsername,
  updateStatus: mockUpdateStatus,
  updateStatusIfPending: mockUpdateStatusIfPending,
}));

jest.unstable_mockModule('../src/model/dashboardPremiumAuditModel.js', () => ({
  insertAuditEntry: mockInsertAuditEntry,
}));

jest.unstable_mockModule('../src/model/dashboardUserModel.js', () => ({
  findById: mockFindById,
  findByUsername: mockFindByUsername,
}));

jest.unstable_mockModule('../src/service/dashboardSubscriptionService.js', () => ({
  createSubscription: mockCreateSubscription,
}));

jest.unstable_mockModule('../src/service/waService.js', () => ({
  default: mockWaClient,
  waitForWaReady: mockWaitForWaReady,
}));

jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  formatToWhatsAppId: mockFormatToWhatsAppId,
  getAdminWAIds: mockGetAdminWAIds,
  safeSendMessage: mockSafeSendMessage,
}));

let service;

beforeAll(async () => {
  service = await import('../src/service/dashboardPremiumRequestService.js');
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADMIN_WHATSAPP = '';
  mockWaitForWaReady.mockResolvedValue();
  mockSafeSendMessage.mockResolvedValue(true);
  mockCreateRequest.mockResolvedValue({
    request_id: 'req-1',
    dashboard_user_id: 'db-user-1',
    username: 'override-user',
    whatsapp: '628111000222',
    bank_name: 'Bank Jago',
    account_number: '1234567890',
    sender_name: 'Sender',
    transfer_amount: 150000,
    premium_tier: 'gold',
    client_id: 'client-a',
    status: 'pending',
  });
  mockInsertAuditEntry.mockResolvedValue({ audit_id: 'audit-1' });
});

test('createPremiumAccessRequest uses dashboard profile data for ID, whatsapp, and session context', async () => {
  const dashboardUser = {
    dashboard_user_id: 'db-user-1',
    username: 'dashboard-user',
    whatsapp: ' 628111000222 ',
    user_uuid: 'uuid-db-user',
  };

  const result = await service.createPremiumAccessRequest({
    dashboardUser,
    bankName: 'Bank Jago',
    accountNumber: '1234567890',
    senderName: 'Sender',
    transferAmount: 150000,
    premiumTier: 'gold',
    clientId: 'client-a',
    submittedUsername: ' override-user ',
    rawAmountField: 'transfer_amount',
    username: 'override-user',
    sessionContext: {
      clientId: 'body-client',
      dashboardUserId: 'body-id',
      userUuid: 'body-uuid',
      username: 'body-username',
    },
  });

  expect(mockCreateRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      dashboardUserId: 'db-user-1',
      username: 'override-user',
      whatsapp: '628111000222',
      clientId: 'client-a',
      metadata: expect.objectContaining({
        dashboard_user_id: 'db-user-1',
        submitted_username: ' override-user ',
        resolved_username: 'override-user',
      }),
      sessionContext: expect.objectContaining({
        dashboardUserId: 'db-user-1',
        userUuid: 'uuid-db-user',
        username: 'override-user',
      }),
      userUuid: 'uuid-db-user',
    }),
  );

  expect(mockInsertAuditEntry).toHaveBeenCalledWith(
    expect.objectContaining({
      dashboardUserId: 'db-user-1',
      actor: 'dashboard_user:dashboard-user',
      statusTo: 'pending',
      adminWhatsapp: '628111000222',
    }),
  );

  expect(mockFormatToWhatsAppId).toHaveBeenCalledWith('628111000222');
  expect(mockWaitForWaReady).toHaveBeenCalledTimes(1);
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    mockWaClient,
    'admin@c.us',
    expect.stringContaining('db-user-1'),
  );
  expect(result.request.dashboard_user_id).toBe('db-user-1');
});
