import { query } from "../../../db/index.js";
import { hariIndo } from "../../../utils/constants.js";
import { getGreeting } from "../../../utils/utilsHelper.js";

export async function absensiRegistrasiDashboardDitbinmas() {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });
  const salam = getGreeting();

  const { rows: clients } = await query(
    `SELECT client_id, nama FROM clients
     WHERE LOWER(client_type) = 'org'
     ORDER BY nama`
  );

  const { rows: registeredRows } = await query(
    `SELECT duc.client_id, COUNT(*) AS operator
     FROM dashboard_user du
     JOIN roles r ON du.role_id = r.role_id
     JOIN dashboard_user_clients duc ON du.dashboard_user_id = duc.dashboard_user_id
     WHERE LOWER(r.role_name) = 'ditbinmas' AND du.status = true
     GROUP BY duc.client_id`
  );

  const countMap = new Map(
    registeredRows.map((r) => [r.client_id.toUpperCase(), Number(r.operator)])
  );

  const sudah = [];
  const belum = [];
  for (const client of clients) {
    const id = client.client_id.toUpperCase();
    const count = countMap.get(id) || 0;
    if (count > 0) {
      sudah.push(`${client.nama.toUpperCase()} : ${count} Operator`);
    } else {
      belum.push(client.nama.toUpperCase());
    }
  }

  let msg = `${salam}\n\n`;
  msg += `Mohon Ijin Komandan,\n\n`;
  msg += `\uD83D\uDCCB Rekap Registrasi User dashboard Cicero DIT BINMAS :\n`;
  msg += `${hari}, ${tanggal}\n`;
  msg += `Jam: ${jam}\n\n`;
  msg += `Absensi Registrasi User Direktorat dan Polres :\n\n`;
  msg += `Sudah :\n`;
  msg += sudah.length ? sudah.map((n) => `- ${n}`).join("\n") : "-";
  msg += `\nBelum :\n`;
  msg += belum.length ? belum.map((n) => `- ${n}`).join("\n") : "-";
  return msg.trim();
}
