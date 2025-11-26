// Backward-compatible wrapper that delegates Satbinmas TikTok media fetches
// to the snapshot-based implementation.
import { fetchTodaySatbinmasOfficialTiktokMediaForOrgClients as fetchOrgClients } from "./satbinmasOfficialTiktokService.js";

/**
 * Fetch today's Satbinmas Official TikTok media for a single client.
 * Delegates to the ORG-wide fetcher and filters the response.
 * @param {string} clientId
 * @param {number} delayMs
 * @returns {Promise<object>}
 */
export async function fetchTodaySatbinmasOfficialTiktokMedia(clientId, delayMs) {
  const summary = await fetchOrgClients(delayMs);
  const normalized = String(clientId || "").trim().toLowerCase();
  const clientSummary = summary.clients.find(
    (item) => String(item.clientId || "").trim().toLowerCase() === normalized
  );

  return (
    clientSummary || {
      clientId,
      name: null,
      accounts: [],
      errors: [],
    }
  );
}

export const fetchTodaySatbinmasOfficialTiktokMediaForOrgClients = fetchOrgClients;
