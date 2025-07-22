import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery
}));

let findUserByIdAndWhatsApp;
let findUserByIdAndClient;
let createUser;
let updateUserField;
let updatePremiumStatus;

beforeAll(async () => {
  const mod = await import('../src/model/userModel.js');
  findUserByIdAndWhatsApp = mod.findUserByIdAndWhatsApp;
  findUserByIdAndClient = mod.findUserByIdAndClient;
  createUser = mod.createUser;
  updateUserField = mod.updateUserField;
  updatePremiumStatus = mod.updatePremiumStatus;
});

test('findUserByIdAndWhatsApp returns user', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '1', nama: 'Test' }] });
  const user = await findUserByIdAndWhatsApp('1', '0808');
  expect(user).toEqual({ user_id: '1', nama: 'Test' });
  expect(mockQuery).toHaveBeenCalledWith(
    'SELECT * FROM "user" WHERE user_id = $1 AND whatsapp = $2',
    ['1', '0808']
  );
});

test('findUserByIdAndClient returns user', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '1', client_id: 'C1' }] });
  const user = await findUserByIdAndClient('1', 'C1');
  expect(user).toEqual({ user_id: '1', client_id: 'C1' });
  expect(mockQuery).toHaveBeenCalledWith(
    'SELECT * FROM "user" WHERE user_id=$1 AND client_id=$2',
    ['1', 'C1']
  );
});

test('createUser inserts with directorate flags', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '9' }] });
  const data = { user_id: '9', nama: 'X', ditbinmas: true, ditlantas: false };
  const row = await createUser(data);
  expect(row).toEqual({ user_id: '9' });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO "user"'),
    [
      '9',
      'X',
      undefined,
      undefined,
      undefined,
      true,
      '',
      '',
      '',
      null,
      false,
      true,
      false,
    ]
  );
});

test('updateUserField updates ditbinmas field', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '1', ditbinmas: true }] });
  const row = await updateUserField('1', 'ditbinmas', true);
  expect(row).toEqual({ user_id: '1', ditbinmas: true });
  expect(mockQuery).toHaveBeenCalledWith(
    'UPDATE "user" SET ditbinmas=$1 WHERE user_id=$2 RETURNING *',
    [true, '1']
  );
});

test('updatePremiumStatus updates fields', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '1', premium_status: true }] });
  const row = await updatePremiumStatus('1', true, '2025-08-01');
  expect(row).toEqual({ user_id: '1', premium_status: true });
  expect(mockQuery).toHaveBeenCalledWith(
    'UPDATE "user" SET premium_status=$2, premium_end_date=$3 WHERE user_id=$1 RETURNING *',
    ['1', true, '2025-08-01']
  );
});
