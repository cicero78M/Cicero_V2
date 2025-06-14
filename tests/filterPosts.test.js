import { filterPostsByMonth } from '../src/utils/filterPosts.js';

describe('filterPostsByMonth', () => {
  test('returns posts within month', () => {
    const posts = [
      { created_at: '2024-05-31T23:00:00Z' },
      { created_at: '2024-06-01T01:00:00Z' },
      { created_at: '2024-06-15T12:00:00Z' },
      { created_at: '2024-07-01T00:00:00Z' }
    ];
    const result = filterPostsByMonth(posts, 6, 2024);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(posts[1]);
    expect(result[1]).toBe(posts[2]);
  });
});
