import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import { readFile, unlink } from "fs/promises";
import { basename } from "path";

import { waGatewayClient } from "../service/waService.js";
import { saveEngagementRankingExcel } from "../service/engagementRankingExcelService.js";
import { safeSendMessage, sendWAFile } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";

const RECIPIENT =
  process.env.DIRREQUEST_ENGAGE_RANK_RECIPIENT || "6281234560377@c.us";
const GROUP_RECIPIENT = "120363419830216549@g.us";
const DEFAULT_RECIPIENTS = [RECIPIENT];
const GROUP_RECIPIENTS = [RECIPIENT, GROUP_RECIPIENT];
const CLIENT_ID = "DITBINMAS";
const ROLE_FLAG = "ditbinmas";

function getJakartaDate() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
}

function formatGreeting(date) {
  const hour = date.getHours();
  if (hour >= 4 && hour < 10) return "Selamat Pagi";
  if (hour >= 10 && hour < 15) return "Selamat Siang";
  if (hour >= 15 && hour < 18) return "Selamat Sore";
  return "Selamat Malam";
}

function buildNarrative(now = getJakartaDate()) {
  const greeting = formatGreeting(now);
  const hari = now.toLocaleDateString("id-ID", {
    weekday: "long",
    timeZone: "Asia/Jakarta",
  });
  const tanggal = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
  const jam = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(now)
    .replace(":", ".");

  return (
    `${greeting},` +
    "\n\n" +
    "Mohon Ijin Komandan," +
    "\n" +
    "Mengirimkan Ranking Jajaran tugas pelaksanaan likes dan komentar Konten Instagram dan Tiktok pada akun Official Ditbinmas Polda Jatim, pada " +
    `${hari}, ${tanggal}, pukul ${jam} WIB.`
  );
}

export async function runCron({ recipients = DEFAULT_RECIPIENTS } = {}) {
  const requestedTargets = Array.isArray(recipients)
    ? recipients.filter(Boolean)
    : [recipients].filter(Boolean);
  const targets = requestedTargets.length ? requestedTargets : DEFAULT_RECIPIENTS;

  sendDebug({
    tag: "CRON DIRREQ ENGAGE RANK",
    msg:
      "Mulai cron dirrequest engage rank" +
      (targets.length ? ` untuk ${targets.join(", ")}` : ""),
  });

  let filePath = null;

  try {
    const { filePath: generatedPath } = await saveEngagementRankingExcel({
      clientId: CLIENT_ID,
      roleFlag: ROLE_FLAG,
    });
    filePath = generatedPath;

    const buffer = await readFile(filePath);
    const narrative = buildNarrative();

    for (const target of targets) {
      await safeSendMessage(waGatewayClient, target, narrative.trim());
    }
    await sendWAFile(
      waGatewayClient,
      buffer,
      basename(filePath),
      targets,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    sendDebug({
      tag: "CRON DIRREQ ENGAGE RANK",
      msg:
        "Laporan ranking engagement dikirim" +
        (targets.length ? ` ke ${targets.join(", ")}` : ""),
    });
  } catch (err) {
    sendDebug({
      tag: "CRON DIRREQ ENGAGE RANK",
      msg: `[ERROR] ${err.message || err}`,
    });
  } finally {
    if (filePath) {
      await unlink(filePath).catch(() => {});
    }
  }
}

cron.schedule("7 15 * * *", runCron, { timezone: "Asia/Jakarta" });
cron.schedule("40 20 * * *", runCron, { timezone: "Asia/Jakarta" });
cron.schedule("45 20 * * *", () => runCron({ recipients: GROUP_RECIPIENTS }), {
  timezone: "Asia/Jakarta",
});

export default null;
