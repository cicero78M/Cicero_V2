import { jest } from '@jest/globals';

const mockFindClientById = jest.fn();

jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));
jest.unstable_mockModule('../src/model/userModel.js', () => ({}));
jest.unstable_mockModule('../src/service/instaPostService.js', () => ({}));
jest.unstable_mockModule('../src/service/instaLikeService.js', () => ({}));
jest.unstable_mockModule('../src/service/tiktokPostService.js', () => ({}));
jest.unstable_mockModule('../src/service/tiktokCommentService.js', () => ({}));

let getClientProfile;

beforeAll(async () => {
  ({ getClientProfile } = await import('../src/controller/clientController.js'));
});

afterEach(() => {
  mockFindClientById.mockReset();
});

test('uses role client data for social media fields when non-operator org', async () => {
  mockFindClientById
    .mockResolvedValueOnce({
      client_id: 'ORG1',
      client_type: 'org',
      client_insta: 'orginsta',
      client_insta_status: false,
      client_tiktok: 'orgtiktok',
      client_tiktok_status: false,
      client_amplify_status: false,
    })
    .mockResolvedValueOnce({
      client_id: 'DITBINMAS',
      client_type: 'direktorat',
      client_insta: 'ditinsta',
      client_insta_status: true,
      client_tiktok: 'dittiktok',
      client_tiktok_status: true,
      client_amplify_status: true,
    });

  const req = { params: {}, query: { client_id: 'ORG1' }, body: {}, user: { role: 'ditbinmas' } };
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const res = { json, status };

  await getClientProfile(req, res, () => {});

  expect(mockFindClientById).toHaveBeenNthCalledWith(1, 'ORG1');
  expect(mockFindClientById).toHaveBeenNthCalledWith(2, 'DITBINMAS');
  expect(json).toHaveBeenCalledWith({
    success: true,
    client: expect.objectContaining({
      client_id: 'ORG1',
      client_type: 'org',
      client_insta: 'ditinsta',
      client_insta_status: true,
      client_tiktok: 'dittiktok',
      client_tiktok_status: true,
      client_amplify_status: true,
    }),
  });
});

test('uses token client_id when not provided in request', async () => {
  mockFindClientById.mockResolvedValueOnce({ client_id: 'C1', client_type: 'org' });
  const req = { params: {}, query: {}, body: {}, user: { client_id: 'C1' } };
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const res = { json, status };

  await getClientProfile(req, res, () => {});

  expect(mockFindClientById).toHaveBeenCalledWith('C1');
  expect(json).toHaveBeenCalledWith({ success: true, client: { client_id: 'C1', client_type: 'org' } });
});
