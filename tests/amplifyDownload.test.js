import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const mockGenerateExcelBuffer = jest.fn();
const mockRedis = { on: jest.fn(), connect: jest.fn() };

jest.unstable_mockModule('../src/config/redis.js', () => ({ default: mockRedis }));
jest.unstable_mockModule('../src/service/waService.js', () => ({ default: {}, waReady: false }));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({ sendConsoleDebug: jest.fn(), sendDebug: jest.fn() }));
jest.unstable_mockModule('../src/service/amplifyExportService.js', () => ({
  generateExcelBuffer: mockGenerateExcelBuffer,
  generateLinkReportExcelBuffer: jest.fn(),
  exportRowsToGoogleSheet: jest.fn()
}));
jest.unstable_mockModule('../src/middleware/authMiddleware.js', () => ({
  authRequired: (req, res, next) => next()
}));

let app;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test';
  const mod = await import('../src/routes/index.js');
  const routes = mod.default;
  app = express();
  app.use(express.json());
  app.use('/api', routes);
});

beforeEach(() => {
  mockGenerateExcelBuffer.mockReset();
});

test('POST /download-amplify returns excel file', async () => {
  mockGenerateExcelBuffer.mockReturnValue(Buffer.from('hi'));
  const res = await request(app)
    .post('/api/download-amplify')
    .send({ rows: [{ a: 1 }], fileName: 'file' });
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  expect(res.headers['content-disposition']).toContain('file.xlsx');
  expect(mockGenerateExcelBuffer).toHaveBeenCalledWith([{ a: 1 }]);
});

test('POST /download-amplify validates rows', async () => {
  const res = await request(app).post('/api/download-amplify').send({ rows: 'x' });
  expect(res.status).toBe(400);
});
