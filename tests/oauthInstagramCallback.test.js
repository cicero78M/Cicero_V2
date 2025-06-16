import { jest } from '@jest/globals';

// Mock instagramApi module to avoid loading axios
jest.unstable_mockModule('../src/service/instagramApi.js', () => ({
  deleteInstagramCallback: jest.fn(),
}));

let handleInstagramOAuthCallback;

beforeAll(async () => {
  process.env.INSTAGRAM_APP_ID = 'id';
  process.env.INSTAGRAM_APP_SECRET = 'secret';
  process.env.INSTAGRAM_REDIRECT_URI = 'http://localhost/callback';
  const module = await import('../src/controller/oauthController.js');
  handleInstagramOAuthCallback = module.handleInstagramOAuthCallback;
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('handleInstagramOAuthCallback', () => {
  test('exchanges code for token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'token' }),
    });
    global.fetch = fetchMock;

    const req = { query: { code: '123', state: 's' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handleInstagramOAuthCallback(req, res);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.instagram.com/oauth/access_token',
      expect.objectContaining({ method: 'POST' })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { access_token: 'token' } });
  });
});
