import { getUsersByClient } from "../model/userModel.js";
import { formatNama } from "../utils/utilsHelper.js";

const DITBINMAS_CLIENT_ID = "DITBINMAS";
const TARGET_JABATAN = "KASAT BINMAS";
const TARGET_ROLE = "ditbinmas";

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
  const kasatkers = (users || []).filter(
    (user) => (user?.jabatan || "").trim().toUpperCase() === TARGET_JABATAN
  );

  if (!kasatkers.length) {
    return "Tidak ada data Kasat Binmas aktif yang dapat ditampilkan.";
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
      .sort((a, b) => (a?.nama || "").localeCompare(b?.nama || "", "id-ID", { sensitivity: "base" }))
      .map((user, idx) => {
        const division = (user?.divisi || "-").toUpperCase();
        const name = formatNama(user) || "(Tanpa Nama)";
        const status = formatAccountStatus(user);
        return `${idx + 1}. ${name} (${division}) — ${status}`;
      }),
  ];

  return summaryLines.filter(Boolean).join("\n");
}

export default { generateKasatkerAttendanceSummary };
