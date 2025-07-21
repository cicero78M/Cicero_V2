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
  const lines = [
    `Client ID       : ${client.client_id || "-"}`,
    `Nama            : ${client.nama || "-"}`,
    `Tipe            : ${client.client_type || "-"}`,
    `Status          : ${client.client_status ? "✅ Aktif" : "❌ Tidak aktif"}`,
    `Instagram       : ${client.client_insta ? "@" + client.client_insta : "-"}`,
    `IG Aktif        : ${client.client_insta_status ? "✅ Aktif" : "❌ Tidak aktif"}`,
    `TikTok          : ${client.client_tiktok ? "@" + client.client_tiktok : "-"}`,
    `TikTok Aktif    : ${client.client_tiktok_status ? "✅ Aktif" : "❌ Tidak aktif"}`,
    `Amplifikasi     : ${client.client_amplify_status ? "✅ Aktif" : "❌ Tidak aktif"}`,
    `Operator WA     : ${client.client_operator || "-"}`,
    `Group WA        : ${client.client_group || "-"}`,
    `Super Admin     : ${client.client_super || "-"}`,
  ];
  return [
    "🗂️ *Informasi Client*",
    "```",
    ...lines,
    "```",
    "",
    "*Instagram Link*: " + 
      (client.client_insta
        ? `https://instagram.com/${client.client_insta}`
        : "-"),
    "*TikTok Link*: " +
      (client.client_tiktok
        ? `https://www.tiktok.com/@${client.client_tiktok}`
        : "-"),
    "*Operator WA*: " + 
      (client.client_operator
        ? `https://wa.me/${client.client_operator.replace(/\D/g, "")}`
        : "-"),
    "*Super Admin*: " +
      (client.client_super
        ? `https://wa.me/${client.client_super.replace(/\D/g, "")}`
        : "-"),
    "",
    "*TikTok secUid:*",
    "```",
    client.tiktok_secuid || "-",
    "```",
  ].join("\n");
}


export function formatUserData(user) {
  const labels = [
    ["NRP/NIP", user.user_id || "-"],
    ["Nama", user.nama || "-"],
    ["Pangkat", user.title || "-"],
    ["Satfung", user.divisi || "-"],
    ["Jabatan", user.jabatan || "-"],
    [
      "Status",
      user.status === true || user.status === "true"
        ? "✅ AKTIF"
        : "❌ NON-AKTIF",
    ],
    ["WhatsApp", user.whatsapp || "-"],
    [
      "Instagram",
      user.insta
        ? (user.insta.startsWith("@") ? user.insta : "@" + user.insta)
        : "-",
    ],
    ["TikTok", user.tiktok || "-"],
    ["Polres", user.client_id || "-"],
  ];
  const pad = Math.max(...labels.map(([label]) => label.length));
  return [
    "```",
    ...labels.map(
      ([label, value]) =>
        label.padEnd(pad) + " : " + value
    ),
    "```",
  ].join("\n");
}


export function extractFirstUrl(text) {
  if (!text) return null;
  const match = String(text).match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}

export function formatDdMmYyyy(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d)) return null;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatIsoTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const str = String(value).trim();
  // dd/mm/yyyy or dd-mm-yyyy optionally with time HH:MM
  let match = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:[ T](\d{2}):(\d{2}))?$/);
  if (match) {
    const [, d, m, y, hh = '00', mm = '00'] = match;
    return `${y}-${m}-${d}T${hh}:${mm}:00Z`;
  }
  // yyyy-mm-dd or yyyy/mm/dd optionally with time
  match = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (match) {
    const [, y, m, d, hh = '00', mm = '00'] = match;
    return `${y}-${m}-${d}T${hh}:${mm}:00Z`;
  }
  const d = new Date(str);
  if (!Number.isNaN(d)) return d.toISOString();
  return null;
}

export function formatIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = String(value).trim();
  let match = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const d = new Date(str);
  if (!Number.isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

export function extractInstagramShortcode(text) {
  if (!text) return null;
  const str = String(text).trim();
  const urlMatch = str.match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel)\/([^/?#]+)/i
  );
  let code = urlMatch ? urlMatch[1] : str.replace(/[/?#].*$/, '');
  if (/^[A-Za-z0-9_-]+$/.test(code)) return code;
  return null;
}
