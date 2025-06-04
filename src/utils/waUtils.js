function sortDivisionKeys(keys) {
  const order = ["BAG", "SAT", "SI", "POLSEK"];
  return keys.sort((a, b) => {
    const ia = order.findIndex((prefix) => a.toUpperCase().startsWith(prefix));
    const ib = order.findIndex((prefix) => b.toUpperCase().startsWith(prefix));
    return (
      (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
    );
  });
}


function sortTitleKeys(keys, pangkatOrder) {
  // pangkatOrder: array urut dari DB
  return keys.slice().sort((a, b) => {
    const ia = pangkatOrder.indexOf(a);
    const ib = pangkatOrder.indexOf(b);
    return (
      (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
    );
  });
}