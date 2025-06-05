import cron from "node-cron";
import { cronTiktokHarian } from "../service/cronTiktokService.js";

cron.schedule("50 6-22 * * *", async () => {
  try {
    // broadcast ke admin/nomor WA tertentu, misal group admin
    const chatId = "6281234567890@c.us"; // Ganti dengan nomor admin/tujuan WA
    await cronTiktokHarian(chatId);
  } catch (e) {
    console.error("Cron TikTok error:", e);
  }
});
