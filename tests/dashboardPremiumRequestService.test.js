import { jest } from '@jest/globals';

const mockCreateRequest = jest.fn();
const mockFindLatestPendingByUsername = jest.fn();
const mockUpdateStatus = jest.fn();
const mockUpdateStatusIfPending = jest.fn();
const mockCreateSubscription = jest.fn();
const mockFindById = jest.fn();
const mockFindByUsername = jest.fn();
const mockInsertAuditEntry = jest.fn();

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

jest.unstable_mockModule('../src/model/dashboardUserModel.js', () => ({
  findById: mockFindById,
  findByUsername: mockFindByUsername,
}));

jest.unstable_mockModule('../src/model/dashboardPremiumRequestAuditModel.js', () => ({
  insertAuditEntry: mockInsertAuditEntry,
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
  mockInsertAuditEntry.mockResolvedValue({ audit_id: 'audit-1' });
  mockFindLatestPendingByUsername.mockResolvedValue(null);
  mockFindById.mockResolvedValue(null);
  mockFindByUsername.mockResolvedValue(null);
  mockUpdateStatus.mockResolvedValue(null);
  mockUpdateStatusIfPending.mockResolvedValue(null);
  mockCreateSubscription.mockResolvedValue({ subscription: null, cache: null });
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

  expect(mockFormatToWhatsAppId).toHaveBeenCalledWith('628111000222');
  expect(mockWaitForWaReady).toHaveBeenCalledTimes(1);
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    mockWaClient,
    'admin@c.us',
    expect.stringContaining('db-user-1'),
  );
  expect(result.request.dashboard_user_id).toBe('db-user-1');
  expect(mockInsertAuditEntry).toHaveBeenCalledWith(
    expect.objectContaining({
      requestId: 'req-1',
      action: 'created',
      sessionContext: expect.objectContaining({
        clientId: 'client-a',
        dashboardUserId: 'db-user-1',
        userUuid: 'uuid-db-user',
        username: 'override-user',
      }),
    }),
  );
});

test('createPremiumAccessRequest nulls blank dashboard_user_id before create', async () => {
  const dashboardUser = {
    dashboard_user_id: '   ',
    username: 'dashboard-user',
    whatsapp: '   ',
  };

  mockCreateRequest.mockResolvedValue({
    request_id: 'req-blank',
    dashboard_user_id: ' ',
    username: 'dashboard-user',
    whatsapp: null,
    bank_name: 'Bank Jago',
    account_number: '1234567890',
    sender_name: 'Sender',
    transfer_amount: 150000,
    premium_tier: 'gold',
    client_id: 'client-a',
    status: 'pending',
  });

  await service.createPremiumAccessRequest({
    dashboardUser,
    bankName: 'Bank Jago',
    accountNumber: '1234567890',
    senderName: 'Sender',
    transferAmount: 150000,
    premiumTier: 'gold',
    clientId: 'client-a',
    username: 'dashboard-user',
    sessionContext: {
      clientId: 'body-client',
      dashboardUserId: 'body-id',
      userUuid: 'body-uuid',
      username: 'body-username',
    },
  });

  expect(mockCreateRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      dashboardUserId: null,
      whatsapp: null,
      sessionContext: expect.objectContaining({
        dashboardUserId: null,
      }),
    }),
  );

  expect(mockInsertAuditEntry).toHaveBeenCalledWith(
    expect.objectContaining({
      requestId: 'req-blank',
      action: 'created',
      sessionContext: expect.objectContaining({
        dashboardUserId: null,
        userUuid: null,
      }),
    }),
  );
});

test('approvePendingRequest uses dashboard user from DB and records audit', async () => {
  const requestRow = {
    request_id: 'req-approve',
    username: 'dashboard-user',
    dashboard_user_id: '   ',
    client_id: 'client-a',
  };
  mockFindLatestPendingByUsername.mockResolvedValue(requestRow);
  mockFindByUsername.mockResolvedValue({
    dashboard_user_id: 'db-user-from-db',
    username: 'dashboard-user',
    whatsapp: ' 628123 ',
    user_uuid: 'uuid-db',
  });
  mockUpdateStatusIfPending.mockResolvedValue({
    ...requestRow,
    status: 'approved',
    dashboard_user_id: 'db-user-from-db',
  });
  mockCreateSubscription.mockResolvedValue({
    subscription: { dashboard_user_id: 'db-user-from-db' },
    cache: { premium: true },
  });

  const result = await service.approvePendingRequest({
    username: 'dashboard-user',
    adminWhatsapp: '62888',
    adminChatId: 'chat-123',
  });

  expect(result.status).toBe('approved');
  expect(result.dashboardUser.dashboard_user_id).toBe('db-user-from-db');
  expect(result.applicantWhatsapp).toBe('628123');
  expect(mockCreateSubscription).toHaveBeenCalledWith(
    expect.objectContaining({ dashboard_user_id: 'db-user-from-db' }),
  );
  expect(mockUpdateStatusIfPending).toHaveBeenCalledWith(
    expect.objectContaining({
      requestId: 'req-approve',
      status: 'approved',
      adminWhatsapp: '62888',
    }),
  );
  expect(mockInsertAuditEntry).toHaveBeenCalledWith(
    expect.objectContaining({
      requestId: 'req-approve',
      action: 'approved',
      adminWhatsapp: '62888',
      adminChatId: 'chat-123',
      sessionContext: expect.objectContaining({
        clientId: 'client-a',
        dashboardUserId: 'db-user-from-db',
        userUuid: 'uuid-db',
        username: 'dashboard-user',
      }),
    }),
  );
});

test('rejectPendingRequest records audit even when dashboard user is missing', async () => {
  const requestRow = {
    request_id: 'req-reject',
    username: 'pending-user',
    dashboard_user_id: '',
    client_id: 'client-b',
    status: 'pending',
  };
  mockFindLatestPendingByUsername.mockResolvedValue(requestRow);
  mockFindByUsername.mockResolvedValue(null);
  mockUpdateStatusIfPending.mockResolvedValue({
    ...requestRow,
    status: 'rejected',
  });

  const result = await service.rejectPendingRequest({
    username: 'pending-user',
    adminWhatsapp: '62admin',
    adminChatId: 'chat-2',
  });

  expect(result.status).toBe('rejected');
  expect(result.applicantWhatsapp).toBeNull();
  expect(mockUpdateStatusIfPending).toHaveBeenCalledWith(
    expect.objectContaining({
      requestId: 'req-reject',
      status: 'rejected',
      adminWhatsapp: '62admin',
    }),
  );
  expect(mockInsertAuditEntry).toHaveBeenCalledWith(
    expect.objectContaining({
      requestId: 'req-reject',
      action: 'rejected',
      adminWhatsapp: '62admin',
      adminChatId: 'chat-2',
      sessionContext: expect.objectContaining({
        clientId: 'client-b',
        dashboardUserId: null,
        username: 'pending-user',
      }),
    }),
  );
});
