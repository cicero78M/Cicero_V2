import { jest } from '@jest/globals';

const mockFindClientById = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetLikesSets = jest.fn();
const mockGroupUsersByClientDivision = jest.fn();
const mockGetPostsTodayByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockAoAToSheet = jest.fn();
const mockBookNew = jest.fn();
const mockBookAppendSheet = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();

jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));

jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
}));

jest.unstable_mockModule('../src/utils/likesHelper.js', () => ({
  getLikesSets: mockGetLikesSets,
  groupUsersByClientDivision: mockGroupUsersByClientDivision,
  normalizeUsername: (username) =>
    (username || '')
      .toString()
      .trim()
      .replace(/^@/, '')
      .toLowerCase(),
}));

jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsTodayByClient: mockGetPostsTodayByClient,
}));

jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getCommentsByVideoId: mockGetCommentsByVideoId,
}));

jest.unstable_mockModule('fs/promises', () => ({
  mkdir: mockMkdir,
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

describe('engagementRankingExcelService', () => {
  let collectEngagementRanking;
  let saveEngagementRankingExcel;

  beforeEach(async () => {
    jest.resetModules();
    mockFindClientById.mockReset();
    mockGetShortcodesTodayByClient.mockReset();
    mockGetLikesSets.mockReset();
    mockGroupUsersByClientDivision.mockReset();
    mockGetPostsTodayByClient.mockReset();
    mockGetCommentsByVideoId.mockReset();
    mockAoAToSheet.mockReset();
    mockBookNew.mockReset();
    mockBookAppendSheet.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();

    mockBookNew.mockReturnValue({});
    mockAoAToSheet.mockImplementation((aoa) => ({ aoa }));
    mockBookAppendSheet.mockImplementation(() => {});
    mockWriteFile.mockImplementation(() => {});
    mockMkdir.mockResolvedValue();

    mockFindClientById.mockImplementation(async (cid) => {
      const map = {
        ditbinmas: { nama: 'Direktorat Binmas', client_type: 'direktorat' },
        polres_a: { nama: 'Polres A', client_type: 'org' },
        polres_b: { nama: 'Polres B', client_type: 'org' },
      };
      return map[String(cid || '').toLowerCase()] || null;
    });

    mockGroupUsersByClientDivision.mockResolvedValue({
      polresIds: ['DITBINMAS', 'POLRES_A', 'POLRES_B'],
      usersByClient: {
        DITBINMAS: [
          { insta: '@dit1', tiktok: '@dit1', exception: false },
          { insta: '', tiktok: '', exception: false },
        ],
        POLRES_A: [
          { insta: '@userA', tiktok: '@userA', exception: false },
          { insta: '@userB', tiktok: '', exception: true },
        ],
        POLRES_B: [{ insta: '@userC', tiktok: '@userC', exception: false }],
      },
    });

    mockGetShortcodesTodayByClient.mockResolvedValue(['sc1', 'sc2']);
    mockGetLikesSets.mockResolvedValue([
      new Set(['dit1', 'usera', 'userc']),
      new Set(['usera']),
    ]);

    mockGetPostsTodayByClient.mockResolvedValue([
      { video_id: 'vid1' },
      { video_id: 'vid2' },
    ]);
    mockGetCommentsByVideoId.mockResolvedValue({
      comments: [
        { username: '@userA' },
        { user: { unique_id: 'userc' } },
      ],
    });

    ({ collectEngagementRanking, saveEngagementRankingExcel } = await import(
      '../src/service/engagementRankingExcelService.js'
    ));
  });

  test('collectEngagementRanking aggregates stats per satker', async () => {
    const result = await collectEngagementRanking('DITBINMAS', 'ditbinmas');

    expect(mockGroupUsersByClientDivision).toHaveBeenCalledWith('ditbinmas');
    expect(result.entries).toHaveLength(3);
    const first = result.entries[0];
    expect(first.name).toBe('DIREKTORAT BINMAS');
    expect(first.igSudah).toBe(1);
    expect(first.igBelum).toBe(0);
    expect(first.ttSudah).toBe(0);
    expect(first.ttKosong).toBe(1);

    const totals = result.totals;
    expect(totals.totalPersonil).toBe(5);
    expect(totals.igSudah).toBeGreaterThan(0);
    expect(result.igPostsCount).toBe(2);
    expect(result.ttPostsCount).toBe(2);
  });

  test('saveEngagementRankingExcel writes workbook and returns file path', async () => {
    const { filePath, fileName } = await saveEngagementRankingExcel({
      clientId: 'DITBINMAS',
      roleFlag: 'ditbinmas',
    });

    expect(mockAoAToSheet).toHaveBeenCalled();
    const aoa = mockAoAToSheet.mock.calls[0][0];
    expect(aoa[0][0]).toMatch(/Rekap Ranking Engagement/i);
    expect(aoa[5]).toEqual([
      'Nama Satker',
      'Jumlah Personil',
      'Instagram',
      null,
      null,
      'TikTok',
      null,
      null,
    ]);
    expect(aoa[6]).toEqual([
      null,
      null,
      'Sudah',
      'Belum',
      'Username Kosong',
      'Sudah',
      'Belum',
      'Username Kosong',
    ]);
    expect(aoa[aoa.length - 1][0]).toBe('TOTAL');

    expect(mockBookNew).toHaveBeenCalled();
    expect(mockBookAppendSheet).toHaveBeenCalled();
    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
    expect(filePath).toBeTruthy();
    expect(fileName).toMatch(/Rekap_Ranking_Engagement/);
  });

  test('collectEngagementRanking rejects for non directorate client', async () => {
    mockFindClientById.mockResolvedValueOnce({
      nama: 'Polres A',
      client_type: 'org',
    });

    await expect(collectEngagementRanking('POLRES_A')).rejects.toThrow(
      /direktorat/i
    );
  });
});
