import { absensiRegistrasiDashboardDitbinmas } from '../handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDitbinmas.js';
import { sendWAReport, getAdminWAIds } from '../utils/waHelper.js';
import waService from '../service/waService.js';

export async function runCron() {
  const msg = await absensiRegistrasiDashboardDitbinmas();
  const targets = getAdminWAIds();
  await sendWAReport(waService, msg, targets);
}

export default { runCron };
