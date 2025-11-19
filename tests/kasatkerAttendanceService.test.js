import { jest } from '@jest/globals';

let generateKasatkerAttendanceSummary;
let mockGetUsersByClient;

describe('generateKasatkerAttendanceSummary', () => {
  beforeEach(async () => {
    jest.resetModules();
    mockGetUsersByClient = jest.fn();
    jest.unstable_mockModule('../src/model/userModel.js', () => ({
      getUsersByClient: mockGetUsersByClient,
    }));
    ({ generateKasatkerAttendanceSummary } = await import(
      '../src/service/kasatkerAttendanceService.js'
    ));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('filters Kasat Binmas and keeps jabatan data for summary', async () => {
    mockGetUsersByClient.mockResolvedValue([
      {
        user_id: '1',
        nama: 'Alpha',
        title: 'AKP',
        divisi: 'Sat Binmas',
        client_name: 'Polres Contoh',
        jabatan: 'Kasat Binmas',
        insta: 'alpha.ig',
        tiktok: 'alpha.tt',
      },
      {
        user_id: '2',
        nama: 'Beta',
        title: 'IPTU',
        divisi: 'Sat Binmas',
        jabatan: 'Operator',
        insta: null,
        tiktok: null,
      },
    ]);

    const summary = await generateKasatkerAttendanceSummary({
      clientId: 'ditbinmas',
      roleFlag: 'custom-role',
    });

    expect(mockGetUsersByClient).toHaveBeenCalledWith('DITBINMAS', 'custom-role');
    expect(summary).toContain('Total Kasat Binmas: 1');
    expect(summary).toContain('Alpha');
    expect(summary).toContain('Client: DITBINMAS');
  });

  test('uses client_name or client_id for displayed polres info', async () => {
    mockGetUsersByClient.mockResolvedValue([
      {
        user_id: '1',
        nama: 'Gamma',
        title: 'AKP',
        divisi: 'Sat Lama',
        client_name: 'Polres Bukit',
        jabatan: 'Kasat Binmas',
        insta: null,
        tiktok: null,
      },
    ]);

    const summary = await generateKasatkerAttendanceSummary();

    expect(summary).toContain('POLRES BUKIT');
    expect(summary).not.toContain('SAT LAMA');
  });

  test('returns fallback text when there are no Kasat Binmas', async () => {
    mockGetUsersByClient.mockResolvedValue([
      { user_id: '1', jabatan: 'Operator' },
    ]);

    const summary = await generateKasatkerAttendanceSummary({
      clientId: 'polresabc',
    });

    expect(mockGetUsersByClient).toHaveBeenCalledWith('POLRESABC', 'ditbinmas');
    expect(summary).toBe(
      'Dari 1 user aktif POLRESABC (ditbinmas), tidak ditemukan data Kasat Binmas.'
    );
  });
});
