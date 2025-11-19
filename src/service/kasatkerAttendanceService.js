import { getUsersByClient } from "../model/userModel.js";
import { formatNama } from "../utils/utilsHelper.js";

const DITBINMAS_CLIENT_ID = "DITBINMAS";
const TARGET_ROLE = "ditbinmas";
const PANGKAT_ORDER = [
  "KOMISARIS BESAR POLISI",
  "AKBP",
  "KOMPOL",
  "AKP",
  "IPTU",
  "IPDA",
  "AIPTU",
  "AIPDA",
  "BRIPKA",
  "BRIGPOL",
  "BRIGADIR",
  "BRIGADIR POLISI",
  "BRIPTU",
  "BRIPDA",
];

const REGION_KEYWORDS = [
  "POLRES",
  "POLDA",
  "POLRESTA",
  "POLTABES",
  "POLSEK",
  "KOTA",
  "KAB",
  "KABUPATEN",
  "RESORT",
  "WILAYAH",
];
const REGION_REGEX = new RegExp(`\\b(${REGION_KEYWORDS.join("|")})\\b`, "g");
const KASAT_BINMAS_REGEX = /KASAT\s*BINMAS/;

function rankWeight(rank) {
  const idx = PANGKAT_ORDER.indexOf(String(rank || "").toUpperCase());
  return idx === -1 ? PANGKAT_ORDER.length : idx;
}

function sanitizeJabatanText(jabatan = "") {
  if (!jabatan) {
    return "";
  }

  return jabatan
    .toString()
    .replace(/[.,/:;\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .replace(REGION_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesKasatBinmasJabatan(jabatan) {
  const sanitized = sanitizeJabatanText(jabatan);
  if (!sanitized) {
    return false;
  }

  return KASAT_BINMAS_REGEX.test(sanitized.replace(/\s+/g, " "));
}

function formatAccountStatus(user) {
  const ig = user?.insta ? "✅" : "❌";
  const tiktok = user?.tiktok ? "✅" : "❌";
  return `IG ${ig} | TT ${tiktok}`;
}

export async function generateKasatkerAttendanceSummary({
  clientId = DITBINMAS_CLIENT_ID,
  roleFlag,
} = {}) {
  const targetClientId = (clientId || DITBINMAS_CLIENT_ID).toUpperCase();
  const targetRole = roleFlag || TARGET_ROLE;
  const users = await getUsersByClient(targetClientId, targetRole);
  const kasatkers = (users || []).filter((user) =>
    matchesKasatBinmasJabatan(user?.jabatan)
  );

  if (!kasatkers.length) {
    const totalUsers = users?.length || 0;
    return `Dari ${totalUsers} user aktif ${targetClientId} (${targetRole}), tidak ditemukan data Kasat Binmas.`;
  }

  const withInsta = kasatkers.filter((user) => !!user.insta).length;
  const withTiktok = kasatkers.filter((user) => !!user.tiktok).length;
  const summaryLines = [
    "📋 *Absensi Kasatker (Kasat Binmas)*",
    `Client: ${targetClientId}`,
    `Total Kasat Binmas: ${kasatkers.length}`,
    `IG terdaftar: ${withInsta}/${kasatkers.length}`,
    `TikTok terdaftar: ${withTiktok}/${kasatkers.length}`,
    "",
    ...kasatkers
      .sort((a, b) => {
        const rankDiff = rankWeight(a?.title) - rankWeight(b?.title);
        if (rankDiff !== 0) {
          return rankDiff;
        }
        const nameA = formatNama(a) || "";
        const nameB = formatNama(b) || "";
        return nameA.localeCompare(nameB, "id-ID", { sensitivity: "base" });
      })
      .map((user, idx) => {
        const polres = (user?.client_name || user?.client_id || "-").toUpperCase();
        const name = formatNama(user) || "(Tanpa Nama)";
        const status = formatAccountStatus(user);
        return `${idx + 1}. ${name} (${polres}) — ${status}`;
      }),
  ];

  return summaryLines.filter(Boolean).join("\n");
}

export default { generateKasatkerAttendanceSummary };
