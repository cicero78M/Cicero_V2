import {
  buildAggregatorPayload,
  refreshAggregatorData,
  resolveAggregatorClient,
} from "../service/aggregatorService.js";
import { sendSuccess } from "../utils/response.js";
import { sendConsoleDebug } from "../middleware/debugHandler.js";

export async function getAggregator(req, res) {
  try {
    const clientIdsFromUser = Array.isArray(req.user?.client_ids)
      ? req.user.client_ids
      : [];
    const clientId =
      req.query.client_id ||
      req.headers["x-client-id"] ||
      req.user?.client_id ||
      (clientIdsFromUser.length === 1 ? clientIdsFromUser[0] : null);

    if (!clientId) {
      sendConsoleDebug({
        tag: "AGG",
        msg: "getAggregator missing client identifier",
      });
      return res
        .status(400)
        .json({
          success: false,
          message:
            "client_id atau header x-client-id wajib diisi (atau gunakan token dengan satu client_id)",
        });
    }
    const resolution = await resolveAggregatorClient(clientId, req.user?.role);
    if (!resolution) {
      return res
        .status(404)
        .json({ success: false, message: "client not found" });
    }
    const { client, resolvedClientId, requestedClientId, reason } = resolution;
    sendConsoleDebug({
      tag: "AGG",
      msg: `getAggregator ${requestedClientId} => ${resolvedClientId} (${reason})`,
    });
    const limitRequest = parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitRequest) ? 10 : limitRequest;
    const periode = req.query.periode || "harian";
    const payload = await buildAggregatorPayload(client, resolvedClientId, periode, limit);

    sendSuccess(res, payload);
  } catch (err) {
    sendConsoleDebug({ tag: "AGG", msg: `Error getAggregator: ${err.message}` });
    res.status(500).json({ success: false, message: err.message });
  }
}

