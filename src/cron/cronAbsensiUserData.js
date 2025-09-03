import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { sendWAReport, getAdminWAIds } from "../utils/waHelper.js";
import { getUsersMissingDataByClient, getClientsByRole } from "../model/userModel.js";
import { query } from "../db/index.js";
const dirRequestGroup = "120363419830216549@g.us";
const dirRequestNumber = "6281234560377@c.us";

function sortClients(clients) {
  return clients.sort((a, b) => {
    if (a.client_id === "DITBINMAS") return -1;
    if (b.client_id === "DITBINMAS") return 1;
    if (a.client_type !== b.client_type) {
      if (a.client_type === "direktorat") return -1;
      if (b.client_type === "direktorat") return 1;
    }
    return a.nama.localeCompare(b.nama);
  });
}

function formatMissing(user) {
  const parts = [];
  if (!user.whatsapp) parts.push("Belum Registrasi Whatsapp");
  if (!user.insta) parts.push("Instagram Kosong");
  if (!user.tiktok) parts.push("Tiktok Kosong");
  return parts.join(", ");
}

export async function runCron(chatIds = null) {
  const targets = chatIds && chatIds.length ? chatIds : getAdminWAIds();
  try {
    const clientIds = await getClientsByRole("operator");
    clientIds.push("DITBINMAS");
    const { rows } = await query(
      `SELECT client_id, nama, client_type FROM clients WHERE client_id = ANY($1::text[])`,
      [clientIds.map((id) => id.toUpperCase())]
    );
    const ordered = sortClients(rows);
    const lines = ["*Rekap User Belum Melengkapi Data*"];
    for (let i = 0; i < ordered.length; i++) {
      const c = ordered[i];
      lines.push(`${i + 1}. ${c.nama}`);
      const users = await getUsersMissingDataByClient(c.client_id);
      for (const u of users) {
        const miss = formatMissing(u);
        lines.push(`- ${u.nama} (${u.user_id}): ${miss}`);
      }
    }
    const message = lines.join("\n");
    await sendWAReport(waClient, message, targets);
  } catch {
    // silently ignore errors
  }
}

const options = { timezone: "Asia/Jakarta" };

cron.schedule("30 15 * * *", () => runCron([dirRequestGroup]), options);
cron.schedule("30 18 * * *", () => runCron([dirRequestGroup]), options);
cron.schedule(
  "30 20 * * *",
  () => runCron([dirRequestGroup, dirRequestNumber, ...getAdminWAIds()]),
  options
);
cron.schedule(
  "12 22 * * 4",
  () => runCron([dirRequestGroup, dirRequestNumber, ...getAdminWAIds()]),
  options
);

export default null;
