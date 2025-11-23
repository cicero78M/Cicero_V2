import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const mockFindById = jest.fn();

let officialAccountRoutes;
let controllerMocks;

async function setupRouter() {
  jest.resetModules();
  mockFindById.mockReset();

  controllerMocks = {
    getOfficialAccounts: jest.fn((req, res) =>
      res.json({ ok: true, client_id: req.query.client_id || null })
    ),
    postOfficialAccount: jest.fn((req, res) =>
      res.status(201).json({ ok: true, client_id: req.body.client_id })
    ),
    putOfficialAccount: jest.fn((req, res) =>
      res.json({ ok: true, updated: req.params.official_account_id })
    ),
    deleteOfficialAccountById: jest.fn((req, res) =>
      res.json({ ok: true, deleted: req.params.official_account_id })
    ),
  };

  jest.unstable_mockModule('../src/repository/officialAccountRepository.js', () => ({
    findById: mockFindById,
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  }));

  jest.unstable_mockModule('../src/controller/officialAccountController.js', () => controllerMocks);

  ({ default: officialAccountRoutes } = await import('../src/routes/officialAccountRoutes.js'));
}

function buildApp(userPayload) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = userPayload;
    next();
  });
  app.use('/api/official-accounts', officialAccountRoutes);
  return app;
}

describe('officialAccountAccess middleware', () => {
  beforeEach(async () => {
    await setupRouter();
  });

  test('allows Ditbinmas to manage official accounts for any client', async () => {
    const app = buildApp({ role: 'Ditbinmas', client_ids: ['alpha'] });

    const res = await request(app)
      .post('/api/official-accounts')
      .send({ platform: 'instagram', handle: 'any', client_id: 'beta' });

    expect(res.status).toBe(201);
    expect(res.body.client_id).toBe('beta');
    expect(controllerMocks.postOfficialAccount).toHaveBeenCalledTimes(1);
  });

  test('blocks Polres from updating accounts outside their client_id', async () => {
    mockFindById.mockResolvedValue({ official_account_id: '123', client_id: 'other-client' });
    const app = buildApp({ role: 'polres', client_ids: ['alpha-client'] });

    const res = await request(app)
      .put('/api/official-accounts/123')
      .send({ display_name: 'Updated' });

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(controllerMocks.putOfficialAccount).not.toHaveBeenCalled();
  });

  test('auto-derives client_id for Polres listing requests', async () => {
    const app = buildApp({ role: 'polres', client_ids: ['polres-a'] });

    const res = await request(app).get('/api/official-accounts');

    expect(res.status).toBe(200);
    expect(res.body.client_id).toBe('polres-a');
    expect(controllerMocks.getOfficialAccounts).toHaveBeenCalledTimes(1);
  });

  test('prevents Bhabinkamtibmas from modifying official accounts', async () => {
    const app = buildApp({ role: 'bhabinkamtibmas', client_ids: ['bhb-1'] });

    const res = await request(app)
      .post('/api/official-accounts')
      .send({ platform: 'instagram', handle: 'readonly' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(controllerMocks.postOfficialAccount).not.toHaveBeenCalled();
  });
});
