export function sortDivisionKeys(keys) {
  const order = ["BAG", "SAT", "SI", "POLSEK"];
  return keys.sort((a, b) => {
    const ia = order.findIndex((prefix) => a.toUpperCase().startsWith(prefix));
    const ib = order.findIndex((prefix) => b.toUpperCase().startsWith(prefix));
    return (
      (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
    );
  });
}

export function sortTitleKeys(keys, pangkatOrder) {
  // pangkatOrder: array urut dari DB
  return keys.slice().sort((a, b) => {
    const ia = pangkatOrder.indexOf(a);
    const ib = pangkatOrder.indexOf(b);
    return (
      (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
    );
  });
}

export function groupByDivision(arr) {
  const divGroups = {};
  arr.forEach((u) => {
    const div = u.divisi || "-";
    if (!divGroups[div]) divGroups[div] = [];
    divGroups[div].push(u);
  });
  return divGroups;
}
export function formatNama(u) {
  return [u.title, u.nama].filter(Boolean).join(" ");
}
export function normalizeKomentarArr(arr) {
  return arr
    .map((c) => {
      if (typeof c === "string") return c.replace(/^@/, "").toLowerCase();
      if (c && typeof c === "object") {
        return (c.user?.unique_id || c.username || "")
          .replace(/^@/, "")
          .toLowerCase();
      }
      return "";
    })
    .filter(Boolean);
}
