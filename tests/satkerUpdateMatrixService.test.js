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
    expect(result.stats[0]).toMatchObject({
      cid: 'ditbinmas',
      instaPercent: 100,
      jumlahDsp: 102,
    });
    expect(result.stats[1]).toMatchObject({
      cid: 'polres_b',
      instaPercent: 100,
      tiktokPercent: 50,
      jumlahDsp: null,
    });
    expect(result.stats[2]).toMatchObject({ cid: 'polres_a', instaPercent: 50, jumlahDsp: null });
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
      'Jumlah DSP',
      'Jumlah Personil',
      'Data Update Instagram',
      null,
      'Data Update Tiktok',
      null,
    ]);
    expect(aoa[1]).toEqual([null, null, null, 'Sudah', 'Belum', 'Sudah', 'Belum']);
    expect(aoa[2]).toEqual([
      'DIREKTORAT BINMAS',
      102,
      1,
      1,
      0,
      1,
      0,
    ]);
    expect(aoa[3]).toEqual([
      'POLRES A',
      null,
      1,
      0,
      1,
      0,
      1,
    ]);

    const worksheet = mockAoAToSheet.mock.results[0].value;
    expect(worksheet['!merges']).toEqual([
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
      { s: { r: 0, c: 3 }, e: { r: 0, c: 4 } },
      { s: { r: 0, c: 5 }, e: { r: 0, c: 6 } },
    ]);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const savedPath = mockWriteFile.mock.calls[0][1];
    expect(savedPath).toContain('Satker_Update_Rank_');
    expect(filePath).toBe(savedPath);
  });
});
