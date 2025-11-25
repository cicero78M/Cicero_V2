import {
  findAllOrgClients,
  findById as findClientById,
} from "../model/clientModel.js";
import {
  findByClientIdAndPlatform,
  findByPlatformAndUsername,
  upsertAccount,
  findByClientAndPlatform,
} from "../model/satbinmasOfficialAccountModel.js";
import { fetchTiktokProfile } from "./tiktokRapidService.js";

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const RAPIDAPI_FETCH_DELAY_MS = 1500;
const wait = (ms = RAPIDAPI_FETCH_DELAY_MS) =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

export async function syncSatbinmasOfficialTiktokSecUidForOrgClients(
  delayMs = RAPIDAPI_FETCH_DELAY_MS
) {
  const clients = await findAllOrgClients();
  const summary = {
    clients: [],
    totals: {
      clients: 0,
      accounts: 0,
      resolved: 0,
      failed: 0,
      missing: 0,
    },
  };

  for (let clientIndex = 0; clientIndex < clients.length; clientIndex += 1) {
    const client = clients[clientIndex];
    const accounts = await findByClientAndPlatform(client.client_id, "tiktok");

    const clientSummary = {
      clientId: client.client_id,
      name: client.nama,
      accounts: [],
      errors: [],
      missingAccounts: accounts.length === 0,
    };

    summary.totals.clients += 1;

    if (clientSummary.missingAccounts) {
      summary.totals.missing += 1;
      summary.clients.push(clientSummary);
      const isLastClient = clientIndex === clients.length - 1;
      if (!isLastClient) await wait(delayMs);
      continue;
    }

    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      summary.totals.accounts += 1;

      if (!account.username?.trim()) {
        clientSummary.errors.push({
          username: account.username || "(kosong)",
          message: "Username TikTok kosong di tabel satbinmas_official_accounts.",
        });
        summary.totals.failed += 1;
      } else {
        try {
          const result = await resolveSatbinmasOfficialTiktokSecUid({
            clientId: client.client_id,
            username: account.username,
          });
          clientSummary.accounts.push({
            username: result.username,
            secUid: result.secUid,
          });
          summary.totals.resolved += 1;
        } catch (error) {
          clientSummary.errors.push({
            username: account.username,
            message: error?.message?.slice(0, 200) || "Gagal sinkron secUid.",
          });
          summary.totals.failed += 1;
        }
      }

      const isLastAccount = index === accounts.length - 1;
      if (!isLastAccount) await wait(delayMs);
    }

    summary.clients.push(clientSummary);

    const isLastClient = clientIndex === clients.length - 1;
    if (!isLastClient) await wait(delayMs);
  }

  return summary;
}
