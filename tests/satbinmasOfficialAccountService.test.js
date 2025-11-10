import { jest } from '@jest/globals';

const mockFindClientById = jest.fn();
const mockFindAccountsByClient = jest.fn();
const mockFindAccountByClientAndPlatform = jest.fn();
const mockFindAccountById = jest.fn();
const mockUpsertAccount = jest.fn();
const mockRemoveAccount = jest.fn();

jest.unstable_mockModule('../src/model/clientModel.js', () => ({
  findById: mockFindClientById,
}));

jest.unstable_mockModule('../src/model/satbinmasOfficialAccountModel.js', () => ({
  findByClientId: mockFindAccountsByClient,
  findByClientIdAndPlatform: mockFindAccountByClientAndPlatform,
  findById: mockFindAccountById,
  upsertAccount: mockUpsertAccount,
  removeById: mockRemoveAccount,
}));

let listSatbinmasOfficialAccounts;
let saveSatbinmasOfficialAccount;
let deleteSatbinmasOfficialAccount;

beforeAll(async () => {
  ({
    listSatbinmasOfficialAccounts,
    saveSatbinmasOfficialAccount,
    deleteSatbinmasOfficialAccount,
  } = await import('../src/service/satbinmasOfficialAccountService.js'));
});

beforeEach(() => {
  mockFindClientById.mockReset();
  mockFindAccountsByClient.mockReset();
  mockFindAccountByClientAndPlatform.mockReset();
  mockFindAccountById.mockReset();
  mockUpsertAccount.mockReset();
  mockRemoveAccount.mockReset();
});

test('listSatbinmasOfficialAccounts returns rows for existing client', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  const accounts = [{ satbinmas_account_id: '1' }];
  mockFindAccountsByClient.mockResolvedValue(accounts);

  const result = await listSatbinmasOfficialAccounts('polres01');

  expect(mockFindClientById).toHaveBeenCalledWith('polres01');
  expect(mockFindAccountsByClient).toHaveBeenCalledWith('POLRES01');
  expect(result).toEqual(accounts);
});

test('listSatbinmasOfficialAccounts throws 404 when client missing', async () => {
  mockFindClientById.mockResolvedValue(null);
  await expect(listSatbinmasOfficialAccounts('unknown')).rejects.toMatchObject({
    statusCode: 404,
  });
});

test('saveSatbinmasOfficialAccount validates platform', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  await expect(
    saveSatbinmasOfficialAccount('POLRES01', {
      username: '@satbinmas',
    })
  ).rejects.toMatchObject({ statusCode: 400 });
});

test('saveSatbinmasOfficialAccount validates username', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  await expect(
    saveSatbinmasOfficialAccount('POLRES01', {
      platform: 'instagram',
    })
  ).rejects.toMatchObject({ statusCode: 400 });
});

test('saveSatbinmasOfficialAccount creates new row with default active flag', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  mockFindAccountByClientAndPlatform.mockResolvedValue(null);
  const account = {
    satbinmas_account_id: 'uuid-1',
    client_id: 'POLRES01',
    platform: 'instagram',
    username: '@Satbinmas',
    is_active: true,
  };
  mockUpsertAccount.mockResolvedValue(account);

  const result = await saveSatbinmasOfficialAccount('polres01', {
    platform: ' Instagram ',
    username: '  @Satbinmas  ',
  });

  expect(mockFindAccountByClientAndPlatform).toHaveBeenCalledWith('POLRES01', 'instagram');
  expect(mockUpsertAccount).toHaveBeenCalledWith({
    client_id: 'POLRES01',
    platform: 'instagram',
    username: '@Satbinmas',
    is_active: true,
  });
  expect(result).toEqual({ account, created: true });
});

test('saveSatbinmasOfficialAccount keeps existing is_active when not provided', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  mockFindAccountByClientAndPlatform.mockResolvedValue({ is_active: false });
  const account = {
    satbinmas_account_id: 'uuid-2',
    client_id: 'POLRES01',
    platform: 'instagram',
    username: '@Satbinmas',
    is_active: false,
  };
  mockUpsertAccount.mockResolvedValue(account);

  const result = await saveSatbinmasOfficialAccount('POLRES01', {
    platform: 'instagram',
    username: '@Satbinmas',
  });

  expect(mockUpsertAccount).toHaveBeenCalledWith({
    client_id: 'POLRES01',
    platform: 'instagram',
    username: '@Satbinmas',
    is_active: false,
  });
  expect(result).toEqual({ account, created: false });
});

test('saveSatbinmasOfficialAccount validates boolean values', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  mockFindAccountByClientAndPlatform.mockResolvedValue(null);

  await expect(
    saveSatbinmasOfficialAccount('POLRES01', {
      platform: 'instagram',
      username: '@Satbinmas',
      is_active: 'maybe',
    })
  ).rejects.toMatchObject({ statusCode: 400 });
});

test('saveSatbinmasOfficialAccount parses boolean strings', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  mockFindAccountByClientAndPlatform.mockResolvedValue({ is_active: false });
  const account = {
    satbinmas_account_id: 'uuid-3',
    client_id: 'POLRES01',
    platform: 'tiktok',
    username: '@sat',
    is_active: true,
  };
  mockUpsertAccount.mockResolvedValue(account);

  const result = await saveSatbinmasOfficialAccount('POLRES01', {
    platform: 'TIKTOK',
    username: '@sat',
    is_active: 'yes',
  });

  expect(mockUpsertAccount).toHaveBeenCalledWith({
    client_id: 'POLRES01',
    platform: 'tiktok',
    username: '@sat',
    is_active: true,
  });
  expect(result).toEqual({ account, created: false });
});

test('deleteSatbinmasOfficialAccount validates account id', async () => {
  await expect(deleteSatbinmasOfficialAccount('POLRES01')).rejects.toMatchObject({
    statusCode: 400,
  });
});

test('deleteSatbinmasOfficialAccount checks client existence', async () => {
  mockFindClientById.mockResolvedValue(null);
  await expect(
    deleteSatbinmasOfficialAccount('POLRES01', 'uuid-1')
  ).rejects.toMatchObject({ statusCode: 404 });
});

test('deleteSatbinmasOfficialAccount checks account ownership', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  mockFindAccountById.mockResolvedValue({ client_id: 'OTHER' });

  await expect(
    deleteSatbinmasOfficialAccount('POLRES01', 'uuid-1')
  ).rejects.toMatchObject({ statusCode: 404 });
});

test('deleteSatbinmasOfficialAccount removes and returns row', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  const deleted = {
    satbinmas_account_id: 'uuid-5',
    client_id: 'POLRES01',
    platform: 'instagram',
    username: '@sat',
    is_active: true,
  };
  mockFindAccountById.mockResolvedValue({ client_id: 'POLRES01' });
  mockRemoveAccount.mockResolvedValue(deleted);

  const result = await deleteSatbinmasOfficialAccount('POLRES01', 'uuid-5');

  expect(mockRemoveAccount).toHaveBeenCalledWith('uuid-5');
  expect(result).toEqual(deleted);
});
