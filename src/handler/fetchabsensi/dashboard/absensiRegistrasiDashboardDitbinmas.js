import { query } from "../../../db/index.js";
import { getClientsByRole } from "../../../model/userModel.js";
import { hariIndo } from "../../../utils/constants.js";
import { getGreeting } from "../../../utils/utilsHelper.js";

export async function absensiRegistrasiDashboardDitbinmas() {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });
  const salam = getGreeting();

  const polresIds = (await getClientsByRole("ditbinmas")).map((id) => id.toUpperCase());
  const { rows: polresRows } = await query(
    "SELECT client_id, nama FROM clients WHERE client_id = ANY($1::varchar[]) ORDER BY nama",
    [polresIds]
  );

  const { rows: registeredRows } = await query(
    `SELECT DISTINCT duc.client_id FROM dashboard_user du
     JOIN roles r ON du.role_id = r.role_id
     JOIN dashboard_user_clients duc ON du.dashboard_user_id = duc.dashboard_user_id
     WHERE LOWER(r.role_name) = 'ditbinmas' AND du.status = true`
  );
  const registeredSet = new Set(registeredRows.map((r) => r.client_id.toUpperCase()));

  const sudah = [];
  const belum = [];
  for (const pr of polresRows) {
    if (registeredSet.has(pr.client_id.toUpperCase())) {
      sudah.push(pr.nama);
    } else {
      belum.push(pr.nama);
    }
  }

  let msg = `${salam}\n\n`;
  msg += `\uD83D\uDCCB Rekap Registrasi User dashboard Cicero DIT BINMAS :\n`;
  msg += `${hari}, ${tanggal}\n`;
  msg += `Jam: ${jam}\n\n`;
  msg += `Absensi Registrasi User Direktorat dan Polres :\n\n`;
  msg += `*Sudah :*\n`;
  msg += sudah.length ? sudah.map((n) => `- ${n}`).join("\n") : "-";
  msg += `\n*Belum :*\n`;
  msg += belum.length ? belum.map((n) => `- ${n}`).join("\n") : "-";
  return msg.trim();
}
