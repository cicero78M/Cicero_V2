import waClient from "../service/waService.js";
import { sendWAReport, getAdminWAIds } from "../utils/waHelper.js";
import { absensiRegistrasiDashboardDitbinmas } from "../handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDitbinmas.js";

export async function runCron() {
  const message = await absensiRegistrasiDashboardDitbinmas();
  await sendWAReport(waClient, message, getAdminWAIds());
}

export default null;
