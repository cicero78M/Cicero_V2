import { jest } from '@jest/globals';

const mockCreateUser = jest.fn();
const mockFindUserById = jest.fn();
const mockUpdateUserField = jest.fn();
const mockUpdateUser = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetUsersByDirektorat = jest.fn();

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  createUser: mockCreateUser,
  findUserById: mockFindUserById,
  updateUserField: mockUpdateUserField,
  updateUser: mockUpdateUser,
  getUsersByClient: mockGetUsersByClient,
  getUsersByDirektorat: mockGetUsersByDirektorat
}));

let createUser;
let getUserList;

beforeAll(async () => {
  const mod = await import('../src/controller/userController.js');
  createUser = mod.createUser;
  getUserList = mod.getUserList;
});

beforeEach(() => {
  mockCreateUser.mockReset();
  mockFindUserById.mockReset();
  mockUpdateUserField.mockReset();
  mockUpdateUser.mockReset();
  mockGetUsersByClient.mockReset();
  mockGetUsersByDirektorat.mockReset();
});

test('operator adds user with defaults', async () => {
  mockCreateUser.mockResolvedValue({ user_id: '1' });
  const req = { body: { user_id: '1', nama: 'A' }, user: { role: 'operator', client_id: 'c1' } };
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const res = { status, json };

  await createUser(req, res, () => {});

  expect(mockCreateUser).toHaveBeenCalledWith({
    user_id: '1',
    nama: 'A',
    ditbinmas: false,
    ditlantas: false,
    bidhumas: false,
    operator: true,
  });
  expect(status).toHaveBeenCalledWith(201);
  expect(json).toHaveBeenCalledWith({ success: true, data: { user_id: '1' } });
});

test('operator assigns ditbinmas role when specified', async () => {
  mockCreateUser.mockResolvedValue({ user_id: '3' });
  const req = {
    body: { user_id: '3', nama: 'C', roles: ['ditbinmas'] },
    user: { role: 'operator', client_id: 'c1' }
  };
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const res = { status, json };

  await createUser(req, res, () => {});

  expect(mockCreateUser).toHaveBeenCalledWith({
    user_id: '3',
    nama: 'C',
    ditbinmas: true,
  });
  expect(mockCreateUser.mock.calls[0][0].operator).toBeUndefined();
  expect(status).toHaveBeenCalledWith(201);
  expect(json).toHaveBeenCalledWith({ success: true, data: { user_id: '3' } });
});

test('operator assigns multiple roles simultaneously', async () => {
  mockCreateUser.mockResolvedValue({ user_id: '4' });
  const req = {
    body: { user_id: '4', nama: 'D', roles: ['operator', 'ditbinmas'] },
    user: { role: 'operator', client_id: 'c1' }
  };
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const res = { status, json };

  await createUser(req, res, () => {});

  expect(mockCreateUser).toHaveBeenCalledWith({
    user_id: '4',
    nama: 'D',
    operator: true,
    ditbinmas: true,
    ditlantas: false,
    bidhumas: false,
  });
  expect(status).toHaveBeenCalledWith(201);
});

test('operator reactivates existing user and attaches operator role', async () => {
  mockFindUserById
    .mockResolvedValueOnce({ user_id: '1', status: false })
    .mockResolvedValueOnce({ user_id: '1', status: true, operator: true, nama: 'A' });
  const req = { body: { user_id: '1', nama: 'A' }, user: { role: 'operator', client_id: 'c1' } };
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const res = { status, json };

  await createUser(req, res, () => {});

  expect(mockFindUserById).toHaveBeenCalledWith('1');
  expect(mockUpdateUserField).toHaveBeenCalledWith('1', 'status', true);
  expect(mockUpdateUserField).toHaveBeenCalledWith('1', 'operator', true);
  expect(mockUpdateUserField).toHaveBeenCalledTimes(2);
  expect(mockCreateUser).not.toHaveBeenCalled();
  expect(status).toHaveBeenCalledWith(200);
  expect(json).toHaveBeenCalledWith({
    success: true,
    data: { user_id: '1', status: true, operator: true, nama: 'A' }
  });
});

test('operator reactivates existing user with multiple roles', async () => {
  mockFindUserById
    .mockResolvedValueOnce({ user_id: '5', status: false })
    .mockResolvedValueOnce({
      user_id: '5',
      status: true,
      operator: true,
      ditbinmas: true,
      nama: 'E'
    });
  const req = {
    body: { user_id: '5', nama: 'E', roles: ['operator', 'ditbinmas'] },
    user: { role: 'operator', client_id: 'c1' }
  };
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const res = { status, json };

  await createUser(req, res, () => {});

  expect(mockFindUserById).toHaveBeenCalledWith('5');
  expect(mockUpdateUserField).toHaveBeenCalledWith('5', 'status', true);
  expect(mockUpdateUserField).toHaveBeenCalledWith('5', 'operator', true);
  expect(mockUpdateUserField).toHaveBeenCalledWith('5', 'ditbinmas', true);
  expect(mockUpdateUserField).toHaveBeenCalledTimes(3);
  expect(mockCreateUser).not.toHaveBeenCalled();
  expect(status).toHaveBeenCalledWith(200);
  expect(json).toHaveBeenCalledWith({
    success: true,
    data: {
      user_id: '5',
      status: true,
      operator: true,
      ditbinmas: true,
      nama: 'E'
    }
  });
});

test('reactivates existing user and attaches ditbinmas role', async () => {
  mockFindUserById
    .mockResolvedValueOnce({ user_id: '1', status: false })
    .mockResolvedValueOnce({ user_id: '1', status: true, ditbinmas: true, nama: 'B' });
  const req = { body: { user_id: '1', nama: 'B' }, user: { role: 'ditbinmas', client_id: 'c2' } };
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const res = { status, json };

  await createUser(req, res, () => {});

  expect(mockUpdateUserField).toHaveBeenCalledWith('1', 'status', true);
  expect(mockUpdateUserField).toHaveBeenCalledWith('1', 'ditbinmas', true);
  expect(mockUpdateUserField).toHaveBeenCalledTimes(2);
  expect(mockCreateUser).not.toHaveBeenCalled();
  expect(status).toHaveBeenCalledWith(200);
  expect(json).toHaveBeenCalledWith({
    success: true,
    data: { user_id: '1', status: true, ditbinmas: true, nama: 'B' }
  });
});

test('ditlantas creates new user with flag', async () => {
  mockFindUserById.mockResolvedValue(null);
  mockCreateUser.mockResolvedValue({ user_id: '2', ditlantas: true, client_id: 'c2' });
  const req = { body: { user_id: '2', nama: 'B' }, user: { role: 'ditlantas', client_id: 'c2' } };
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const res = { status, json };

  await createUser(req, res, () => {});

  expect(mockCreateUser).toHaveBeenCalledWith(
    expect.objectContaining({
      user_id: '2',
      nama: 'B',
      client_id: 'c2',
      ditlantas: true,
    })
  );
  expect(status).toHaveBeenCalledWith(201);
});

test('ditbinmas role with matching client_id shows all users', async () => {
  mockGetUsersByDirektorat.mockResolvedValue([{ user_id: '1', ditbinmas: true }]);
  const req = { user: { role: 'ditbinmas', client_id: 'DITBINMAS' } };
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const res = { status, json };

  await getUserList(req, res, () => {});

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas');
  expect(status).toHaveBeenCalledWith(200);
  expect(json).toHaveBeenCalledWith({ success: true, data: [{ user_id: '1', ditbinmas: true }] });
});

test('ditbinmas role with different client_id filters users by client', async () => {
  mockGetUsersByDirektorat.mockResolvedValue([{ user_id: '2', ditbinmas: true }]);
  const req = { user: { role: 'ditbinmas', client_id: 'c1' } };
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const res = { status, json };

  await getUserList(req, res, () => {});

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas', 'c1');
  expect(status).toHaveBeenCalledWith(200);
  expect(json).toHaveBeenCalledWith({ success: true, data: [{ user_id: '2', ditbinmas: true }] });
});
