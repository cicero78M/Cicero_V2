import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let createSubscription;
let getSubscriptions;
let findActiveSubscriptionByUser;
let findLatestSubscriptionByUser;

beforeAll(async () => {
  const mod = await import('../src/model/premiumSubscriptionModel.js');
  createSubscription = mod.createSubscription;
  getSubscriptions = mod.getSubscriptions;
  findActiveSubscriptionByUser = mod.findActiveSubscriptionByUser;
  findLatestSubscriptionByUser = mod.findLatestSubscriptionByUser;
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('createSubscription inserts row', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ subscription_id: 1 }] });
  const data = { username: 'abc', start_date: '2024-01-01' };
  const res = await createSubscription(data);
  expect(res).toEqual({ subscription_id: 1 });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO premium_subscription'),
    ['abc', '2024-01-01', null, true, null]
  );
});

test('getSubscriptions selects all', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ subscription_id: 1 }] });
  const rows = await getSubscriptions();
  expect(rows).toEqual([{ subscription_id: 1 }]);
  expect(mockQuery).toHaveBeenCalledWith(
    'SELECT * FROM premium_subscription ORDER BY created_at DESC'
  );
});

test('findActiveSubscriptionByUser selects active record', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ subscription_id: 1 }] });
  const row = await findActiveSubscriptionByUser('abc');
  expect(row).toEqual({ subscription_id: 1 });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('WHERE username=$1 AND is_active = true'),
    ['abc']
  );
});

test('findLatestSubscriptionByUser selects last record', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ subscription_id: 2 }] });
  const row = await findLatestSubscriptionByUser('def');
  expect(row).toEqual({ subscription_id: 2 });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('WHERE username=$1'),
    ['def']
  );
});
