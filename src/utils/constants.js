
// Regex untuk deteksi link IG/TikTok
export const IG_PROFILE_REGEX =
  /^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]+)(?:[/?].*)?$/i;
export const TT_PROFILE_REGEX =
  /^https?:\/\/(www\.)?tiktok\.com\/@([A-Za-z0-9._]+)\/?$/i;

export const adminCommands = [
  "addnewclient#",
  "updateclient#",
  "removeclient#",
  "clientinfo#",
  "clientrequest",
  "advancedclientrequest",
  "transferuser#",
  "sheettransfer#",
  "thisgroup#",
  "requestinsta#",
  "requesttiktok#",
  "fetchinsta#",
  "fetchtiktok#",
  "absensilikes#",
  "absensikomentar#",
  "exception#",
  "status#",
  "grantsub#",
  "denysub#",
  "approvedash#",
  "denydash#",
];

export const hariIndo = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
