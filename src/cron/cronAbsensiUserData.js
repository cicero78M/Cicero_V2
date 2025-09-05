import waClient from "../service/waService.js";
import { sendWAReport, getAdminWAIds } from "../utils/waHelper.js";
import { getClientsByRole, getUsersMissingDataByClient } from "../model/userModel.js";
import { query } from "../db/index.js";

export async function runCron() {
  await getClientsByRole("ditbinmas");
  const { rows } = await query("SELECT client_id, nama, client_type FROM client", []);
  const filtered = rows || [];
  filtered.sort((a, b) => {
    if (a.client_id === "DITBINMAS") return -1;
    if (b.client_id === "DITBINMAS") return 1;
    if (a.client_type === b.client_type) return a.nama.localeCompare(b.nama);
    return a.client_type === "direktorat" ? -1 : 1;
  });
  const lines = [];
  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i];
    lines.push(`${i + 1}. ${c.nama}`);
    const users = await getUsersMissingDataByClient(c.client_id);
    users.forEach((u) => {
      lines.push(
        `- ${u.nama} (${u.user_id}): Belum Registrasi Whatsapp, Instagram ${
          u.insta || "Kosong"
        }, Tiktok ${u.tiktok || "Kosong"}`
      );
    });
  }
  const message = lines.join("\n");
  await sendWAReport(waClient, message, getAdminWAIds());
}

export default null;
