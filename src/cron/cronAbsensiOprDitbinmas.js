import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { absensiRegistrasiDashboardDitbinmas } from "../handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDitbinmas.js";
import { sendWAReport, getAdminWAIds } from "../utils/waHelper.js";

export async function runCron(chatIds = null) {
  const targets = chatIds && chatIds.length ? chatIds : getAdminWAIds();
  const msg = await absensiRegistrasiDashboardDitbinmas();
  await sendWAReport(waClient, msg, targets);
}

const options = { timezone: "Asia/Jakarta" };
cron.schedule("0 7 * * *", () => runCron(), options);

export default null;
