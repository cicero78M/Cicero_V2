import { findById as findClientById } from "../model/clientModel.js";
import {
  findByClientIdAndPlatform,
  findByPlatformAndUsername,
  upsertAccount,
} from "../model/satbinmasOfficialAccountModel.js";
import { fetchTiktokProfile } from "./tiktokRapidService.js";

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeClientId(value) {
  return String(value || "").trim();
}

function normalizeUsername(username) {
  return username?.replace(/^@/, "").trim();
}

export async function resolveSatbinmasOfficialTiktokSecUid({ clientId, username }) {
  const normalizedClientId = normalizeClientId(clientId);
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedClientId) {
    throw createError("Client ID wajib diisi.", 400);
  }

  if (!normalizedUsername) {
    throw createError("Username TikTok wajib diisi.", 400);
  }

  const client = await findClientById(normalizedClientId);
  if (!client) {
    throw createError("Client tidak ditemukan.", 404);
  }

  if ((client.client_type || "").toUpperCase() !== "ORG") {
    throw createError("Resolusi secUid hanya berlaku untuk client bertipe ORG.", 400);
  }

  const existingAccount = await findByClientIdAndPlatform(client.client_id, "tiktok");

  const conflictingUsername = await findByPlatformAndUsername(
    "tiktok",
    normalizedUsername,
  );

  const isSameAccount =
    conflictingUsername &&
    conflictingUsername.client_id?.toLowerCase() === client.client_id.toLowerCase();

  if (conflictingUsername && !isSameAccount) {
    throw createError(
      "Username TikTok sudah terdaftar sebagai Satbinmas Official untuk client lain.",
      409,
    );
  }

  const profile = await fetchTiktokProfile(normalizedUsername);
  const resolvedSecUid = profile?.secUid;

  if (!resolvedSecUid) {
    throw createError("secUid TikTok tidak ditemukan dari RapidAPI.", 502);
  }

  const savedAccount = await upsertAccount({
    client_id: client.client_id,
    platform: "tiktok",
    username: normalizedUsername,
    display_name: profile?.nickname || existingAccount?.display_name,
    profile_url: profile?.avatar_url || existingAccount?.profile_url,
    secUid: resolvedSecUid,
    is_active: existingAccount?.is_active ?? true,
    is_verified: profile?.verified ?? existingAccount?.is_verified ?? false,
  });

  return {
    client,
    account: savedAccount,
    secUid: resolvedSecUid,
    username: normalizedUsername,
    profile,
  };
}
