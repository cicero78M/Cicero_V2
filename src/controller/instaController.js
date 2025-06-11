// src/controller/instaController.js
import { getRekapLikesByClient } from "../model/instaLikeModel.js";
import * as instaPostService from "../service/instaPostService.js";
import { sendSuccess } from "../utils/response.js";

export async function getInstaRekapLikes(req, res) {
  const client_id = req.query.client_id;
  const periode = req.query.periode || "harian";
  if (!client_id) {
    return res.status(400).json({ success: false, message: "client_id wajib diisi" });
  }
  try {
    const data = await getRekapLikesByClient(client_id, periode);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getInstaPosts(req, res) {
  try {
    const client_id =
      req.query.client_id ||
      req.user?.client_id ||
      req.headers["x-client-id"];
    if (!client_id) {
      return res
        .status(400)
        .json({ success: false, message: "client_id wajib diisi" });
    }

    const posts = await instaPostService.findByClientId(client_id);
    sendSuccess(res, posts);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
