// src/controller/instaController.js
import { getRekapLikesByClient } from "../model/instaLikeModel.js";

export async function getInstaRekapLikes(req, res) {
  const client_id = req.query.client_id;
  if (!client_id) {
    return res.status(400).json({ success: false, message: "client_id wajib diisi" });
  }
  try {
    const data = await getRekapLikesByClient(client_id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
