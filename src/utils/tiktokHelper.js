// src/utils/normalizeTikTokUsername.js
export function normalizeTikTokUsername(val) {
  if (!val) return "";
  if (typeof val !== "string") return "";
  if (val.startsWith("http")) {
    const match = val.match(/tiktok\.com\/@([a-zA-Z0-9._]+)/i);
    return match ? match[1].toLowerCase() : "";
  }
  return val.replace(/^@/, "").trim().toLowerCase();
}
