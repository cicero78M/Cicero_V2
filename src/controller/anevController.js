import { sendConsoleDebug } from "../middleware/debugHandler.js";
import { ALLOWED_TIME_RANGES, getAnevSummary, resolveTimeRange } from "../service/anevService.js";

function normalizeClientIdList(clientIds) {
  if (!Array.isArray(clientIds)) return [];
  return clientIds
    .filter((id) => id != null && String(id).trim() !== "")
    .map((id) => String(id));
}

export async function getAnevDashboard(req, res) {
  try {
    const timeRangeInput = req.query.time_range || req.query.timeRange || "7d";
    const { startDate, endDate, timeRange, error } = resolveTimeRange(
      timeRangeInput,
      req.query.start_date || req.query.startDate,
      req.query.end_date || req.query.endDate
    );
    if (error) {
      return res.status(400).json({ success: false, message: error, permitted_time_ranges: ALLOWED_TIME_RANGES });
    }

    const allowedClientIds = normalizeClientIdList(req.dashboardUser?.client_ids);
    const requestedClientId = req.query.client_id || req.headers["x-client-id"];
    let clientId = null;
    if (requestedClientId) {
      const normalizedRequested = String(requestedClientId).toLowerCase();
      const match = allowedClientIds.find((id) => String(id).toLowerCase() === normalizedRequested);
      if (!match) {
        return res.status(403).json({ success: false, message: "client_id tidak diizinkan" });
      }
      clientId = match;
    } else if (req.dashboardUser?.client_id) {
      clientId = req.dashboardUser.client_id;
    } else if (allowedClientIds.length > 0) {
      [clientId] = allowedClientIds;
    }

    if (!clientId) {
      return res.status(400).json({ success: false, message: "client_id wajib diisi" });
    }

    const resolvedRole = (req.query.role || req.dashboardUser?.role || "").toLowerCase() || null;
    const resolvedScope = (req.query.scope || req.dashboardUser?.scope || "org").toLowerCase();
    if (!["org", "direktorat"].includes(resolvedScope)) {
      return res.status(400).json({ success: false, message: "scope tidak valid" });
    }
    if (!resolvedRole) {
      return res.status(400).json({ success: false, message: "role wajib diisi" });
    }

    const regionalId = req.query.regional_id
      ? String(req.query.regional_id).trim().toUpperCase()
      : null;

    const summary = await getAnevSummary({
      clientId,
      role: resolvedRole,
      scope: resolvedScope,
      regionalId,
      startDate,
      endDate,
      timeRange,
    });

    return res.json({ success: true, data: summary });
  } catch (err) {
    sendConsoleDebug({ tag: "ANEV", msg: `Error getAnevDashboard: ${err.message}` });
    return res.status(500).json({ success: false, message: err.message });
  }
}
