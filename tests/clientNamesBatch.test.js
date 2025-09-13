import { jest } from '@jest/globals';

const mockFindClientNamesByIds = jest.fn();

jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientNamesByIds: mockFindClientNamesByIds,
}));
jest.unstable_mockModule('../src/model/userModel.js', () => ({}));
jest.unstable_mockModule('../src/service/instaPostService.js', () => ({}));
jest.unstable_mockModule('../src/service/instaLikeService.js', () => ({}));
jest.unstable_mockModule('../src/service/tiktokPostService.js', () => ({}));
jest.unstable_mockModule('../src/service/tiktokCommentService.js', () => ({}));

let getClientNamesBatch;

beforeAll(async () => {
  ({ getClientNamesBatch } = await import('../src/controller/clientController.js'));
});

afterEach(() => {
  mockFindClientNamesByIds.mockReset();
});

test('accepts snake_case client_ids', async () => {
  mockFindClientNamesByIds.mockResolvedValueOnce({ C1: 'Client 1' });
  const req = { body: { client_ids: ['C1'] } };
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const res = { status, json };

  await getClientNamesBatch(req, res, () => {});

  expect(mockFindClientNamesByIds).toHaveBeenCalledWith(['C1']);
  expect(status).toHaveBeenCalledWith(200);
  expect(json).toHaveBeenCalledWith({ success: true, data: { C1: 'Client 1' } });
});

test('accepts camelCase clientIds', async () => {
  mockFindClientNamesByIds.mockResolvedValueOnce({ C2: 'Client 2' });
  const req = { body: { clientIds: ['C2'] } };
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const res = { status, json };

  await getClientNamesBatch(req, res, () => {});

  expect(mockFindClientNamesByIds).toHaveBeenCalledWith(['C2']);
  expect(status).toHaveBeenCalledWith(200);
  expect(json).toHaveBeenCalledWith({ success: true, data: { C2: 'Client 2' } });
});

test('returns 400 for missing ids', async () => {
  const req = { body: {} };
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const res = { status, json };

  await getClientNamesBatch(req, res, () => {});

  expect(status).toHaveBeenCalledWith(400);
  expect(json).toHaveBeenCalledWith({ error: 'clientIds must be a non-empty array' });
});
