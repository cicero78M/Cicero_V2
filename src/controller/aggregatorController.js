import { findById } from "../model/clientModel.js";
import * as instaProfileService from "../service/instaProfileService.js";
import * as instaPostService from "../service/instaPostService.js";
import * as tiktokPostService from "../service/tiktokPostService.js";
import * as instaPostModel from "../model/instaPostModel.js";
import * as tiktokPostModel from "../model/tiktokPostModel.js";
import { fetchTiktokProfile } from "../service/tiktokRapidService.js";
import { sendSuccess } from "../utils/response.js";
import { sendConsoleDebug } from "../middleware/debugHandler.js";

async function resolveAggregatorClient(clientId, userRole) {
  const requestedClient = await findById(clientId);
  if (!requestedClient) return null;

  const clientType = requestedClient.client_type?.toLowerCase();
  if (clientType === "direktorat") {
    const directorateRole = userRole?.toLowerCase();
    const roleClient = directorateRole ? await findById(directorateRole) : null;
    const defaultClient =
      roleClient?.client_type?.toLowerCase() === "direktorat"
        ? roleClient
        : requestedClient;
    return {
      client: defaultClient,
      resolvedClientId: defaultClient.client_id,
      requestedClientId: requestedClient.client_id,
      reason:
        defaultClient === requestedClient
          ? "direktorat-requested"
          : "direktorat-role-default",
    };
  }

  if (clientType === "org") {
    const directorateRole = userRole?.toLowerCase();
    if (directorateRole) {
      const directorateClient = await findById(directorateRole);
      if (directorateClient?.client_type?.toLowerCase() === "direktorat") {
        return {
          client: directorateClient,
          resolvedClientId: directorateClient.client_id,
          requestedClientId: requestedClient.client_id,
          reason: "org-role-mapped",
        };
      }
    }
  }

  return {
    client: requestedClient,
    resolvedClientId: requestedClient.client_id,
    requestedClientId: requestedClient.client_id,
    reason: "requested",
  };
}

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
    let igProfile = null;
    let igPosts = [];
    if (client.client_insta) {
      igProfile = await instaProfileService.findByUsername(client.client_insta);
      igPosts =
        periode === "harian"
          ? await instaPostModel.getPostsTodayByClient(resolvedClientId)
          : await instaPostService.findByClientId(resolvedClientId);
      if (Array.isArray(igPosts)) igPosts = igPosts.slice(0, limit);
    }
    let tiktokProfile = null;
    let tiktokPosts = [];
    if (client.client_tiktok) {
      try {
        tiktokProfile = await fetchTiktokProfile(client.client_tiktok);
      } catch (err) {
        sendConsoleDebug({
          tag: "AGG",
          msg: `fetchTiktokProfile error: ${err.message}`,
        });
      }
      tiktokPosts =
        periode === "harian"
          ? await tiktokPostModel.getPostsTodayByClient(resolvedClientId)
          : await tiktokPostService.findByClientId(resolvedClientId);
      if (Array.isArray(tiktokPosts)) tiktokPosts = tiktokPosts.slice(0, limit);
    }
    sendSuccess(res, {
      igProfile,
      igPosts,
      tiktokProfile,
      tiktokPosts,
    });
  } catch (err) {
    sendConsoleDebug({ tag: "AGG", msg: `Error getAggregator: ${err.message}` });
    res.status(500).json({ success: false, message: err.message });
  }
}