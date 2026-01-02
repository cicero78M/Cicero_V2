import { jest } from '@jest/globals';

describe('fetchAndStoreTiktokContent timezone handling', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('treats posts crossing UTC boundary as today in Asia/Jakarta', async () => {
    jest.useFakeTimers();
    const systemTime = new Date('2024-02-29T18:00:00Z');
    jest.setSystemTime(systemTime);

    const expectedJakartaDate = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Jakarta',
    });

    const mockQuery = jest.fn();
    const mockUpsert = jest.fn().mockResolvedValue();
    const mockSendDebug = jest.fn();

    const boundaryCreateTime = Math.floor(
      new Date('2024-02-29T17:30:00Z').getTime() / 1000
    );

    jest.unstable_mockModule('../src/db/index.js', () => ({
      query: mockQuery,
    }));
    jest.unstable_mockModule('../src/model/clientModel.js', () => ({
      update: jest.fn(),
    }));
    jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
      upsertTiktokPosts: mockUpsert,
    }));
    jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
      sendDebug: mockSendDebug,
    }));
    jest.unstable_mockModule('../src/service/tiktokApi.js', () => ({
      fetchTiktokPosts: jest.fn().mockResolvedValue([]),
      fetchTiktokPostsBySecUid: jest
        .fn()
        .mockResolvedValue([
          {
            id: 'boundary-video',
            createTime: boundaryCreateTime,
            stats: { diggCount: 5, commentCount: 2 },
          },
        ]),
      fetchTiktokInfo: jest.fn(),
      fetchTiktokPostDetail: jest.fn(),
    }));

    const { fetchAndStoreTiktokContent } = await import(
      '../src/handler/fetchpost/tiktokFetchPost.js'
    );

    mockQuery
      .mockResolvedValueOnce({ rows: [{ video_id: 'old-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'CLIENT_A',
            client_tiktok: '@clienta',
            tiktok_secuid: 'SEC123',
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ client_id: 'CLIENT_A', client_tiktok: '@clienta' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            video_id: 'boundary-video',
            client_id: 'CLIENT_A',
            created_at: new Date('2024-02-29T17:30:00Z'),
          },
        ],
      });

    await fetchAndStoreTiktokContent('CLIENT_A');

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upsertPayload = mockUpsert.mock.calls[0][1][0];
    expect(upsertPayload.video_id).toBe('boundary-video');

    const selectTodayCall = mockQuery.mock.calls.find((call) =>
      call[0].startsWith('SELECT video_id FROM tiktok_post')
    );
    expect(selectTodayCall).toBeDefined();
    expect(selectTodayCall[0]).toContain(
      "DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') = $1"
    );
    expect(selectTodayCall[1]).toEqual([expectedJakartaDate, 'client_a']);

    const deleteCall = mockQuery.mock.calls.find((call) =>
      call[0].startsWith('DELETE FROM tiktok_post')
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall[0]).toContain(
      "DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') = $2"
    );
    expect(deleteCall[1]).toEqual([
      ['old-1'],
      expectedJakartaDate,
      'client_a',
    ]);

    const finalSelectCall = mockQuery.mock.calls.find((call) =>
      call[0].startsWith('SELECT video_id, client_id, created_at FROM tiktok_post')
    );
    expect(finalSelectCall).toBeDefined();
    expect(finalSelectCall[0]).toContain(
      "DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') = $1"
    );
    expect(finalSelectCall[1]).toEqual([expectedJakartaDate, 'client_a']);
  });
});
