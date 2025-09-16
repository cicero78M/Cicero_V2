import { jest } from '@jest/globals';

const mockGetUsersSocialByClient = jest.fn();
const mockGetClientsByRole = jest.fn();
const mockFindClientById = jest.fn();
const mockAoAToSheet = jest.fn();
const mockBookNew = jest.fn();
const mockBookAppendSheet = jest.fn();
const mockWriteFile = jest.fn();

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersSocialByClient: mockGetUsersSocialByClient,
  getClientsByRole: mockGetClientsByRole,
}));

jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));

jest.unstable_mockModule('xlsx', () => ({
  default: {
    utils: {
      aoa_to_sheet: mockAoAToSheet,
      book_new: mockBookNew,
      book_append_sheet: mockBookAppendSheet,
    },
    writeFile: mockWriteFile,
  },
}));

describe('satkerUpdateMatrixService', () => {
  let collectSatkerUpdateMatrix;
  let saveSatkerUpdateMatrixExcel;

  beforeEach(async () => {
    jest.resetModules();
    mockGetUsersSocialByClient.mockReset();
    mockGetClientsByRole.mockReset();
    mockFindClientById.mockReset();
    mockAoAToSheet.mockReset();
    mockBookNew.mockReset();
    mockBookAppendSheet.mockReset();
    mockWriteFile.mockReset();

    mockBookNew.mockReturnValue({});
    mockAoAToSheet.mockImplementation((aoa) => ({ aoa }));
    mockBookAppendSheet.mockImplementation(() => {});
    mockWriteFile.mockImplementation(() => {});

    mockFindClientById.mockImplementation(async (cid) => {
      const key = String(cid || '').toLowerCase();
      const map = {
        ditbinmas: { nama: 'Direktorat Binmas', client_type: 'direktorat' },
        polres_a: { nama: 'Polres A', client_type: 'org' },
        polres_b: { nama: 'Polres B', client_type: 'org' },
      };
      return map[key] || { nama: key.toUpperCase(), client_type: 'org' };
    });

    ({ collectSatkerUpdateMatrix, saveSatkerUpdateMatrixExcel } = await import(
      '../src/service/satkerUpdateMatrixService.js'
    ));
  });

  test('collectSatkerUpdateMatrix sorts satker with directorate first and computes stats', async () => {
    mockGetUsersSocialByClient.mockResolvedValue([
      { client_id: 'DITBINMAS', insta: 'ig', tiktok: 'tt' },
      { client_id: 'POLRES_A', insta: 'user1', tiktok: 'tk1' },
      { client_id: 'POLRES_A', insta: '', tiktok: '' },
      { client_id: 'POLRES_B', insta: 'user2', tiktok: 'tt2' },
      { client_id: 'POLRES_B', insta: 'user3', tiktok: '' },
    ]);
    mockGetClientsByRole.mockResolvedValue(['polres_a', 'polres_b']);

    const result = await collectSatkerUpdateMatrix('DITBINMAS', 'ditbinmas');

    expect(result.stats).toHaveLength(3);
    expect(result.stats[0].cid).toBe('ditbinmas');
    expect(result.stats[0].instaPercent).toBe(100);
    expect(result.stats[1].cid).toBe('polres_b');
    expect(result.stats[1].instaPercent).toBe(100);
    expect(result.stats[1].tiktokPercent).toBe(50);
    expect(result.stats[2].cid).toBe('polres_a');
    expect(result.stats[2].instaPercent).toBe(50);
    expect(result.totals).toMatchObject({ total: 5, instaFilled: 4, tiktokFilled: 3 });
  });

  test('collectSatkerUpdateMatrix rejects for non directorate client', async () => {
    mockFindClientById.mockImplementationOnce(async () => ({
      nama: 'Polres A',
      client_type: 'org',
    }));
    await expect(collectSatkerUpdateMatrix('POLRES_A')).rejects.toThrow(
      /direktorat/
    );
  });

  test('saveSatkerUpdateMatrixExcel writes workbook with sanitized username', async () => {
    mockGetUsersSocialByClient.mockResolvedValue([
      { client_id: 'DITBINMAS', insta: 'ig', tiktok: 'tt' },
      { client_id: 'POLRES_A', insta: '', tiktok: '' },
    ]);
    mockGetClientsByRole.mockResolvedValue(['polres_a']);

    const { filePath } = await saveSatkerUpdateMatrixExcel({
      clientId: 'DITBINMAS',
      roleFlag: 'ditbinmas',
      username: 'Admin 01',
    });

    expect(mockBookNew).toHaveBeenCalledTimes(1);
    expect(mockAoAToSheet).toHaveBeenCalledTimes(1);
    const aoa = mockAoAToSheet.mock.calls[0][0];
    expect(aoa[0]).toEqual([
      'Satker',
      'Jumlah Personil',
      'Sudah Update Instagram',
      'Belum Update Instagram',
      'Prosentase Sudah Update Instagram',
      'Sudah Update Tiktok',
      'Belum Update Tiktok',
      'Prosentase Sudah Update Tiktok',
    ]);
    expect(aoa[1]).toEqual([
      'DIREKTORAT BINMAS',
      1,
      1,
      0,
      100,
      1,
      0,
      100,
    ]);
    expect(aoa[2]).toEqual([
      'POLRES A',
      1,
      0,
      1,
      0,
      0,
      1,
      0,
    ]);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const savedPath = mockWriteFile.mock.calls[0][1];
    expect(savedPath).toContain('Satker_Admin_01_Update_Rank_');
    expect(filePath).toBe(savedPath);
  });
});
