import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetClientsByRole = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({ getClientsByRole: mockGetClientsByRole }));

const { absensiRegistrasiDashboardDitbinmas } = await import('../src/handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDitbinmas.js');

test('generates report with registered and unregistered polres', async () => {
  mockGetClientsByRole.mockResolvedValue(['polresa', 'polresb']);
  mockQuery.mockImplementation((sql, params) => {
    if (sql.includes('SELECT client_id, nama FROM clients')) {
      return { rows: [
        { client_id: 'POLRESA', nama: 'Polres A' },
        { client_id: 'POLRESB', nama: 'Polres B' },
      ] };
    }
    if (sql.includes('SELECT DISTINCT duc.client_id')) {
      return { rows: [{ client_id: 'POLRESA' }] };
    }
    return { rows: [] };
  });
  const msg = await absensiRegistrasiDashboardDitbinmas();
  expect(msg).toContain('*Sudah :*\n- Polres A');
  expect(msg).toContain('*Belum :*\n- Polres B');
});
