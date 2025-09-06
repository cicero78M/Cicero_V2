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
let getUsersByClient;
let getUsersSocialByClient;
let updateUserRolesUserId;
let updateUser;

beforeAll(async () => {
  const mod = await import('../src/model/userModel.js');
  findUserByIdAndWhatsApp = mod.findUserByIdAndWhatsApp;
  findUserByIdAndClient = mod.findUserByIdAndClient;
  createUser = mod.createUser;
  updateUserField = mod.updateUserField;
  updatePremiumStatus = mod.updatePremiumStatus;
  getUsersByDirektorat = mod.getUsersByDirektorat;
  getClientsByRole = mod.getClientsByRole;
  getUsersByClient = mod.getUsersByClient;
  getUsersSocialByClient = mod.getUsersSocialByClient;
  updateUserRolesUserId = mod.updateUserRolesUserId;
  updateUser = mod.updateUser;
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('findUserByIdAndWhatsApp returns user', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '1', nama: 'Test', ditbinmas: false, ditlantas: false, bidhumas: false, operator: false }] });
  const user = await findUserByIdAndWhatsApp('1', '0808');
  expect(user).toEqual({ user_id: '1', nama: 'Test', ditbinmas: false, ditlantas: false, bidhumas: false, operator: false });
  const sql = mockQuery.mock.calls[0][0];
  expect(sql).toContain('FROM "user" u');
  expect(sql).toContain('u.user_id = $1 AND u.whatsapp = $2');
  expect(mockQuery.mock.calls[0][1]).toEqual(['1', '0808']);
});

test('findUserByIdAndClient returns user for non-direktorat client', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'instansi' }] })
    .mockResolvedValueOnce({ rows: [{ user_id: '1', client_id: 'C1', ditbinmas: false, ditlantas: false, bidhumas: false, operator: false }] });
  const user = await findUserByIdAndClient('1', 'C1');
  expect(user).toEqual({ user_id: '1', client_id: 'C1', ditbinmas: false, ditlantas: false, bidhumas: false, operator: false });
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('FROM "user" u');
  expect(sql).toContain('u.user_id=$1');
  expect(sql).toContain('u.client_id = $2');
  expect(mockQuery.mock.calls[1][1]).toEqual(['1', 'C1']);
});

test('findUserByIdAndClient ignores client_id for direktorat', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [{ user_id: '1', ditbinmas: true, ditlantas: false, bidhumas: false, operator: false }] });
  const user = await findUserByIdAndClient('1', 'ditbinmas');
  expect(user).toEqual({ user_id: '1', ditbinmas: true, ditlantas: false, bidhumas: false, operator: false });
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('EXISTS');
  expect(sql).not.toContain('u.client_id =');
  expect(mockQuery.mock.calls[1][1]).toEqual(['1', 'ditbinmas']);
});

test('getUsersByClient filters by client for non-direktorat', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'instansi' }] })
    .mockResolvedValueOnce({ rows: [{ user_id: '1' }] });
  const users = await getUsersByClient('C1');
  expect(users).toEqual([{ user_id: '1' }]);
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('client_id = $1');
  expect(sql).toContain('OR EXISTS');
  expect(sql).toContain('user_roles');
  expect(mockQuery.mock.calls[1][1]).toEqual(['C1']);
});

test('getUsersByClient uses user_roles for direktorat', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [{ user_id: '2' }] });
  const users = await getUsersByClient('ditlantas');
  expect(users).toEqual([{ user_id: '2' }]);
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('user_roles');
  expect(sql).not.toContain('client_id = $1');
});

test('getUsersByClient adds role filter for instansi when role provided', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'instansi' }] })
    .mockResolvedValueOnce({ rows: [{ user_id: '3' }] });
  const users = await getUsersByClient('C2', 'ditbinmas');
  expect(users).toEqual([{ user_id: '3' }]);
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('client_id = $1');
  expect(sql).toContain('OR EXISTS');
  expect(sql).toContain('user_roles');
  expect(sql).toContain('r.role_name = $2');
  expect(mockQuery.mock.calls[1][1]).toEqual(['C2', 'ditbinmas']);
});

test('getUsersSocialByClient uses HAVING for directorate', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] });
  const users = await getUsersSocialByClient('ditlantas');
  expect(users).toEqual([{ user_id: 'u1' }]);
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('GROUP BY');
  expect(sql).toContain('HAVING');
  expect(sql).toContain('BOOL_OR');
  expect(sql).not.toContain('operator');
  expect(mockQuery.mock.calls[1][1]).toEqual(['ditlantas']);
});

test('getUsersSocialByClient filters by client or role for non-direktorat', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'instansi' }] })
    .mockResolvedValueOnce({ rows: [{ client_type: 'instansi' }] })
    .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] });
  const users = await getUsersSocialByClient('C1');
  expect(users).toEqual([{ user_id: 'u1' }]);
  const sql = mockQuery.mock.calls[2][0];
  expect(sql).toContain('client_id = $1');
  expect(sql).toContain('OR EXISTS');
  expect(sql).toContain('user_roles');
  expect(mockQuery.mock.calls[2][1]).toEqual(['C1']);
});

test('findUserByIdAndClient filters by role for instansi', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'instansi' }] })
    .mockResolvedValueOnce({ rows: [{ user_id: '1', client_id: 'C1', ditbinmas: true, ditlantas: false, bidhumas: false, operator: false }] });
  const user = await findUserByIdAndClient('1', 'C1', 'ditbinmas');
  expect(user).toEqual({ user_id: '1', client_id: 'C1', ditbinmas: true, ditlantas: false, bidhumas: false, operator: false });
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('u.user_id=$1');
  expect(sql).toContain('u.client_id = $2');
  expect(sql).toContain('r.role_name = $3');
  expect(mockQuery.mock.calls[1][1]).toEqual(['1', 'C1', 'ditbinmas']);
});

test('createUser inserts with directorate flags only', async () => {
  mockQuery
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [{ user_id: '9', ditbinmas: true, ditlantas: false, bidhumas: false, operator: false }] });
  const data = { user_id: '9', nama: 'X', ditbinmas: true, ditlantas: false };
  const row = await createUser(data);
  expect(row).toEqual({ user_id: '9', ditbinmas: true, ditlantas: false, bidhumas: false, operator: false });
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
    .mockResolvedValueOnce({ rows: [{ user_id: '10', ditbinmas: false, ditlantas: false, bidhumas: false, operator: false }] });
  const data = { user_id: '10', nama: 'Y', operator: true };
  await createUser(data);
  expect(mockQuery.mock.calls[1][1]).toEqual(['operator']);
  expect(mockQuery.mock.calls[2][1][1]).toBe('operator');
});

test('createUser without role does not assign any', async () => {
  mockQuery
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [{ user_id: '11', ditbinmas: false, ditlantas: false, bidhumas: false, operator: false }] });
  const data = { user_id: '11', nama: 'Z' };
  await createUser(data);
  expect(mockQuery.mock.calls.length).toBe(2);
});

test('updateUserField updates ditbinmas field', async () => {
  mockQuery
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [{ user_id: '1', ditbinmas: true, ditlantas: false, bidhumas: false, operator: false }] });
  const row = await updateUserField('1', 'ditbinmas', true);
  expect(row).toEqual({ user_id: '1', ditbinmas: true, ditlantas: false, bidhumas: false, operator: false });
  expect(mockQuery.mock.calls[1][0]).toContain('user_roles');
});

test('updateUserRolesUserId migrates roles and updates user_id', async () => {
  mockQuery
    .mockResolvedValueOnce({}) // BEGIN
    .mockResolvedValueOnce({ rows: [{ role_id: 1 }] }) // select roles
    .mockResolvedValueOnce({}) // delete old roles
    .mockResolvedValueOnce({}) // update user
    .mockResolvedValueOnce({}) // insert new role
    .mockResolvedValueOnce({}); // COMMIT
  await updateUserRolesUserId('1', '2');
  expect(mockQuery.mock.calls[1][0]).toContain(
    'SELECT role_id FROM user_roles WHERE user_id=$1'
  );
  expect(mockQuery.mock.calls[2][0]).toContain(
    'DELETE FROM user_roles WHERE user_id=$1'
  );
  expect(mockQuery.mock.calls[3][0]).toContain(
    'UPDATE "user" SET user_id=$1 WHERE user_id=$2'
  );
  expect(mockQuery.mock.calls[4][0]).toContain(
    'INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)'
  );
});

test('updateUser updates user_id and migrates roles', async () => {
  mockQuery
    .mockResolvedValueOnce({}) // BEGIN
    .mockResolvedValueOnce({ rows: [{ role_id: 1 }] }) // select roles
    .mockResolvedValueOnce({}) // delete old roles
    .mockResolvedValueOnce({}) // update user
    .mockResolvedValueOnce({}) // insert new role
    .mockResolvedValueOnce({}) // COMMIT
    .mockResolvedValueOnce({
      rows: [
        {
          user_id: '2',
          ditbinmas: false,
          ditlantas: false,
          bidhumas: false,
          operator: false,
        },
      ],
    });

  const row = await updateUser('1', { user_id: '2' });

  expect(mockQuery.mock.calls[1][0]).toContain(
    'SELECT role_id FROM user_roles WHERE user_id=$1'
  );
  expect(mockQuery.mock.calls[2][0]).toContain(
    'DELETE FROM user_roles WHERE user_id=$1'
  );
  expect(mockQuery.mock.calls[3][0]).toContain(
    'UPDATE "user" SET user_id=$1 WHERE user_id=$2'
  );
  expect(mockQuery.mock.calls[4][0]).toContain(
    'INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)'
  );
  expect(row).toEqual({
    user_id: '2',
    ditbinmas: false,
    ditlantas: false,
    bidhumas: false,
    operator: false,
  });
});

test('updateUserField updates desa field', async () => {
  mockQuery
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [{ user_id: '1', desa: 'ABC', ditbinmas: false, ditlantas: false, bidhumas: false, operator: false }] });
  const row = await updateUserField('1', 'desa', 'ABC');
  expect(row).toEqual({ user_id: '1', desa: 'ABC', ditbinmas: false, ditlantas: false, bidhumas: false, operator: false });
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
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '2', ditbinmas: true, ditlantas: false, bidhumas: false, operator: false }] });
  const users = await getUsersByDirektorat('ditbinmas');
  expect(users).toEqual([{ user_id: '2', ditbinmas: true, ditlantas: false, bidhumas: false, operator: false }]);
  const sql = mockQuery.mock.calls[0][0];
  expect(sql).toContain('user_roles');
  expect(sql).toContain('r1.role_name = $1');
  expect(sql).toContain('EXISTS');
  expect(sql).toContain('status = true');
  expect(sql).not.toContain('LOWER(r2.role_name) = LOWER(u.client_id)');
});

test('getUsersByDirektorat filters by client and flag', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '3', bidhumas: true, ditbinmas: false, ditlantas: false, operator: false }] });
  const users = await getUsersByDirektorat('bidhumas', 'c1');
  expect(users).toEqual([{ user_id: '3', bidhumas: true, ditbinmas: false, ditlantas: false, operator: false }]);
  const sql = mockQuery.mock.calls[0][0];
  expect(sql).toContain('user_roles');
  expect(sql).toContain('LOWER(u.client_id) = LOWER($2)');
  expect(sql).toContain('status = true');
  expect(sql).not.toContain('LOWER(r2.role_name) = LOWER(u.client_id)');
  expect(sql.match(/EXISTS/g).length).toBe(1);
});

test('getClientsByRole returns lowercase client ids', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ client_id: 'c1' }, { client_id: 'c2' }] });
  const clients = await getClientsByRole('operator');
  expect(clients).toEqual(['c1', 'c2']);
  expect(mockQuery).toHaveBeenCalledWith(
    `SELECT DISTINCT LOWER(duc.client_id) AS client_id
     FROM dashboard_user du
     JOIN roles r ON du.role_id = r.role_id
     JOIN dashboard_user_clients duc ON du.dashboard_user_id = duc.dashboard_user_id
     WHERE LOWER(r.role_name) = LOWER($1)`,
    ['operator']
  );
});
