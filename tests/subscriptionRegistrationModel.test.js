import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let createRegistration;
let getRegistrations;

beforeAll(async () => {
  const mod = await import('../src/model/subscriptionRegistrationModel.js');
  createRegistration = mod.createRegistration;
  getRegistrations = mod.getRegistrations;
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('createRegistration inserts row', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ registration_id: 1 }] });
  const data = { user_id: 'u1', nama_rekening: 'A', nomor_rekening: 'B', amount: 10 };
  const res = await createRegistration(data);
  expect(res).toEqual({ registration_id: 1 });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO subscription_registration'),
    ['u1', 'A', 'B', null, 10, 'pending', null, null]
  );
});

test('getRegistrations selects all', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ registration_id: 1 }] });
  const rows = await getRegistrations();
  expect(rows).toEqual([{ registration_id: 1 }]);
  expect(mockQuery).toHaveBeenCalledWith(
    'SELECT * FROM subscription_registration ORDER BY created_at DESC'
  );
});
