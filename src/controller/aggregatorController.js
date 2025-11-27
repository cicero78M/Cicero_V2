import { findById } from "../model/clientModel.js";
import * as instaProfileService from "../service/instaProfileService.js";
import * as instaPostService from "../service/instaPostService.js";
import * as tiktokPostService from "../service/tiktokPostService.js";
import * as instaPostModel from "../model/instaPostModel.js";
import * as tiktokPostModel from "../model/tiktokPostModel.js";
import { fetchTiktokProfile } from "../service/tiktokRapidService.js";
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
    sendConsoleDebug({ tag: "AGG", msg: `getAggregator ${clientId}` });
    const client = await findById(clientId);
    if (!client) {
      return res
        .status(404)
        .json({ success: false, message: "client not found" });
    }
    const limitRequest = parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitRequest) ? 10 : limitRequest;
    const periode = req.query.periode || "harian";
    let igProfile = null;
    let igPosts = [];
    if (client.client_insta) {
      igProfile = await instaProfileService.findByUsername(client.client_insta);
      igPosts =
        periode === "harian"
          ? await instaPostModel.getPostsTodayByClient(clientId)
          : await instaPostService.findByClientId(clientId);
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
          ? await tiktokPostModel.getPostsTodayByClient(clientId)
          : await tiktokPostService.findByClientId(clientId);
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

