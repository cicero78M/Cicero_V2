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
let getUsersByDirektorat;
let getClientsByRole;

beforeAll(async () => {
  const mod = await import('../src/model/userModel.js');
  findUserByIdAndWhatsApp = mod.findUserByIdAndWhatsApp;
  findUserByIdAndClient = mod.findUserByIdAndClient;
  createUser = mod.createUser;
  updateUserField = mod.updateUserField;
  updatePremiumStatus = mod.updatePremiumStatus;
  getUsersByDirektorat = mod.getUsersByDirektorat;
  getClientsByRole = mod.getClientsByRole;
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('findUserByIdAndWhatsApp returns user', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '1', nama: 'Test', ditbinmas: false, ditlantas: false, bidhumas: false }] });
  const user = await findUserByIdAndWhatsApp('1', '0808');
  expect(user).toEqual({ user_id: '1', nama: 'Test', ditbinmas: false, ditlantas: false, bidhumas: false });
  const sql = mockQuery.mock.calls[0][0];
  expect(sql).toContain('FROM "user" u');
  expect(sql).toContain('u.user_id = $1 AND u.whatsapp = $2');
  expect(mockQuery.mock.calls[0][1]).toEqual(['1', '0808']);
});

test('findUserByIdAndClient returns user', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '1', client_id: 'C1', ditbinmas: false, ditlantas: false, bidhumas: false }] });
  const user = await findUserByIdAndClient('1', 'C1');
  expect(user).toEqual({ user_id: '1', client_id: 'C1', ditbinmas: false, ditlantas: false, bidhumas: false });
  const sql = mockQuery.mock.calls[0][0];
  expect(sql).toContain('FROM "user" u');
  expect(sql).toContain('u.user_id=$1 AND u.client_id=$2');
  expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'C1']);
});

test('createUser inserts with directorate flags only', async () => {
  mockQuery
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [{ user_id: '9', ditbinmas: true, ditlantas: false, bidhumas: false }] });
  const data = { user_id: '9', nama: 'X', ditbinmas: true, ditlantas: false };
  const row = await createUser(data);
  expect(row).toEqual({ user_id: '9', ditbinmas: true, ditlantas: false, bidhumas: false });
  expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO "user"');
  expect(mockQuery.mock.calls[1][1]).toEqual(['ditbinmas']);
  expect(mockQuery.mock.calls[2][1][1]).toBe('ditbinmas');
  expect(mockQuery.mock.calls.length).toBe(4);
});

test('createUser assigns operator role when specified', async () => {
  mockQuery
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [{ user_id: '10', ditbinmas: false, ditlantas: false, bidhumas: false }] });
  const data = { user_id: '10', nama: 'Y', operator: true };
  await createUser(data);
  expect(mockQuery.mock.calls[1][1]).toEqual(['operator']);
  expect(mockQuery.mock.calls[2][1][1]).toBe('operator');
});

test('createUser without role does not assign any', async () => {
  mockQuery
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [{ user_id: '11', ditbinmas: false, ditlantas: false, bidhumas: false }] });
  const data = { user_id: '11', nama: 'Z' };
  await createUser(data);
  expect(mockQuery.mock.calls.length).toBe(2);
});

test('updateUserField updates ditbinmas field', async () => {
  mockQuery
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [{ user_id: '1', ditbinmas: true, ditlantas: false, bidhumas: false }] });
  const row = await updateUserField('1', 'ditbinmas', true);
  expect(row).toEqual({ user_id: '1', ditbinmas: true, ditlantas: false, bidhumas: false });
  expect(mockQuery.mock.calls[1][0]).toContain('user_roles');
});

test('updateUserField updates desa field', async () => {
  mockQuery
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [{ user_id: '1', desa: 'ABC', ditbinmas: false, ditlantas: false, bidhumas: false }] });
  const row = await updateUserField('1', 'desa', 'ABC');
  expect(row).toEqual({ user_id: '1', desa: 'ABC', ditbinmas: false, ditlantas: false, bidhumas: false });
  expect(mockQuery.mock.calls[0][0]).toContain('UPDATE "user" SET desa=$1 WHERE user_id=$2');
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

test('getUsersByDirektorat queries by flag', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '2', ditbinmas: true, ditlantas: false, bidhumas: false }] });
  const users = await getUsersByDirektorat('ditbinmas');
  expect(users).toEqual([{ user_id: '2', ditbinmas: true, ditlantas: false, bidhumas: false }]);
  const sql = mockQuery.mock.calls[0][0];
  expect(sql).toContain('user_roles');
  expect(sql).toContain('r.role_name = $1');
});

test('getUsersByDirektorat filters by client and flag', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '3', bidhumas: true, ditbinmas: false, ditlantas: false }] });
  const users = await getUsersByDirektorat('bidhumas', 'c1');
  expect(users).toEqual([{ user_id: '3', bidhumas: true, ditbinmas: false, ditlantas: false }]);
  const sql = mockQuery.mock.calls[0][0];
  expect(sql).toContain('user_roles');
  expect(sql).toContain('u.client_id = $2');
});

test('getClientsByRole returns lowercase client ids', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ client_id: 'c1' }, { client_id: 'c2' }] });
  const clients = await getClientsByRole('operator');
  expect(clients).toEqual(['c1', 'c2']);
  expect(mockQuery).toHaveBeenCalledWith(
    'SELECT DISTINCT LOWER(client_id) AS client_id FROM users WHERE LOWER(role_name) = LOWER($1)',
    ['operator']
  );
});
