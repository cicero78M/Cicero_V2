import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetWebLoginCountsByActor = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/loginLogModel.js', () => ({
  getWebLoginCountsByActor: mockGetWebLoginCountsByActor,
}));

const { absensiLoginWeb } = await import('../src/handler/fetchabsensi/dashboard/absensiLoginWeb.js');

beforeEach(() => {
  jest.clearAllMocks();
});

test('builds recap message with dashboard and penmas users', async () => {
  const startTime = new Date('2025-05-05T00:00:00Z');
  const endTime = new Date('2025-05-11T23:59:59Z');

  mockGetWebLoginCountsByActor.mockResolvedValue([
    { actor_id: 'dash-1', login_count: '2' },
    { actor_id: 'pen-1', login_count: '1' },
  ]);

  mockQuery.mockImplementation((sql, params) => {
    if (sql.includes('FROM dashboard_user')) {
      expect(params[0]).toEqual(['dash-1', 'pen-1']);
      return { rows: [{ actor_id: 'dash-1', username: 'alice', role: 'admin' }] };
    }
    if (sql.includes('FROM penmas_user')) {
      expect(params[0]).toEqual(['dash-1', 'pen-1']);
      return { rows: [{ actor_id: 'pen-1', username: 'budi', role: 'operator' }] };
    }
    return { rows: [] };
  });

  const message = await absensiLoginWeb({ mode: 'mingguan', startTime, endTime });

  const startLabel = startTime.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
  const endLabel = endTime.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });

  expect(mockGetWebLoginCountsByActor).toHaveBeenCalledWith({ startTime, endTime });
  expect(message).toContain('Mingguan');
  expect(message).toContain(`Periode: ${startLabel} - ${endLabel}`);
  expect(message).toContain('Total hadir: 2 user (3 login)');
  expect(message).toMatch(/1\. alice \(dashboard - ADMIN\) — 2 kali/);
  expect(message).toMatch(/budi \(penmas - OPERATOR\) — 1 kali/);
});
