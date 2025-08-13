import { jest } from '@jest/globals';

const mockCreateUser = jest.fn();
const mockFindUserById = jest.fn();
const mockUpdateUserField = jest.fn();
const mockUpdateUser = jest.fn();

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  createUser: mockCreateUser,
  findUserById: mockFindUserById,
  updateUserField: mockUpdateUserField,
  updateUser: mockUpdateUser
}));

let createUser;

beforeAll(async () => {
  const mod = await import('../src/controller/userController.js');
  createUser = mod.createUser;
});

beforeEach(() => {
  mockCreateUser.mockReset();
  mockFindUserById.mockReset();
  mockUpdateUserField.mockReset();
  mockUpdateUser.mockReset();
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
  });
  expect(status).toHaveBeenCalledWith(201);
  expect(json).toHaveBeenCalledWith({ success: true, data: { user_id: '1' } });
});

test('ditbinmas updates existing user', async () => {
  mockFindUserById.mockResolvedValue({ user_id: '1', status: false });
  mockUpdateUser.mockResolvedValue({ user_id: '1', ditbinmas: true, nama: 'B' });
  const req = { body: { user_id: '1', nama: 'B' }, user: { role: 'ditbinmas', client_id: 'c2' } };
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const res = { status, json };

  await createUser(req, res, () => {});

  expect(mockUpdateUser).toHaveBeenCalledWith('1', {
    nama: 'B',
    client_id: 'c2',
    ditbinmas: true
  });
  expect(status).toHaveBeenCalledWith(200);
  expect(json).toHaveBeenCalledWith({ success: true, data: { user_id: '1', ditbinmas: true, nama: 'B' } });
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
