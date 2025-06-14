export function filterPostsByMonth(posts, month, year) {
  if (!Array.isArray(posts)) return [];
  const now = new Date();
  const m = parseInt(month);
  const y = parseInt(year);
  const monthNum = Number.isNaN(m) ? now.getMonth() + 1 : m;
  const yearNum = Number.isNaN(y) ? now.getFullYear() : y;
  const start = new Date(yearNum, monthNum - 1, 1);
  const end = new Date(yearNum, monthNum, 1);
  return posts.filter(p => {
    const createdAt = new Date(p.created_at || p.taken_at || p.timestamp);
    return createdAt >= start && createdAt < end;
  });
}
