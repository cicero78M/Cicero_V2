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

// Helper salam
export function getGreeting() {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 4 && hour < 10) return "Selamat pagi";
  if (hour >= 10 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

// Helper untuk formatting info client
export function formatClientInfo(client) {
  return `
🗂️ *Informasi Client*

*Client ID*: \`${client.client_id}\`
*Nama*: ${client.nama}
*Tipe*: ${client.client_type}
*Status*: ${client.client_status ? "✅ Aktif" : "❌ Tidak aktif"}

*Instagram*: ${
    client.client_insta
      ? `[@${client.client_insta}](https://instagram.com/${client.client_insta})`
      : "-"
  } ${client.client_insta_status ? "✅ Aktif" : "❌ Tidak aktif"}
*TikTok*: ${
    client.client_tiktok
      ? `[@${client.client_tiktok}](https://www.tiktok.com/@${client.client_tiktok})`
      : "-"
  } ${client.client_tiktok_status ? "✅ Aktif" : "❌ Tidak aktif"}

*Operator WA*: [${client.client_operator}](https://wa.me/${
    client.client_operator
  })
*Group WA*: ${client.client_group || "-"}
*Super Admin*: [${client.client_super}](https://wa.me/${client.client_super})

*TikTok secUid*:
\`\`\`
${client.tiktok_secuid || "-"}
\`\`\`
`.trim();
}

export function formatUserData(user) {
  return `
══════════════════════════
*NRP/NIP*     : ${user.user_id || "-"}
*Nama*        : ${user.nama || "-"}
*Pangkat*     : ${user.title || "-"}
*Satfung*     : ${user.divisi || "-"}
*Jabatan*     : ${user.jabatan || "-"}
*Status*      : ${
    user.status === true || user.status === "true" ? "✅ AKTIF" : "❌ NON-AKTIF"
  }
*WhatsApp*    : ${user.whatsapp || "-"}
*Instagram*   : ${user.insta ? "@" + user.insta.replace(/^@/, "") : "-"}
*TikTok*      : ${user.tiktok || "-"}
*Polres*      : ${user.client_id || "-"}
══════════════════════════
`.trim();
}
