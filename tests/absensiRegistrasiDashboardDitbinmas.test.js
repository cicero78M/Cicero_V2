import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));

const { absensiRegistrasiDashboardDitbinmas } = await import('../src/handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDitbinmas.js');

test('generates report with operator counts and unregistered clients', async () => {
  mockQuery.mockImplementation((sql) => {
    if (sql.includes('FROM clients')) {
      return {
        rows: [
          { client_id: 'POLRESA', nama: 'Polres A' },
          { client_id: 'POLRESB', nama: 'Polres B' },
        ],
      };
    }
    if (sql.includes('GROUP BY duc.client_id')) {
      return {
        rows: [
          { client_id: 'DITBINMAS', operator: 5 },
          { client_id: 'POLRESA', operator: 2 },
        ],
      };
    }
    return { rows: [] };
  });

  const msg = await absensiRegistrasiDashboardDitbinmas();
  expect(mockQuery.mock.calls[1][0]).toMatch(/OR UPPER\(c\.client_id\) = 'DITBINMAS'/);
  expect(msg).toMatch(/DITBINMAS : 5 Operator\n\nSudah : 1 Polres\n- POLRES A : 2 Operator/);
  expect(msg).toContain('Belum : 1 Polres\n- POLRES B');
});
