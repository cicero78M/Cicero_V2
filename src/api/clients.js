import express from "express";
import * as clientModel from "../model/clientModel.js";

const router = express.Router();

// GET /api/clients — semua client
router.get("/", async (req, res) => {
  try {
    const clients = await clientModel.findAll();
    res.json(clients);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/clients/:id — detail client
router.get("/:id", async (req, res) => {
  try {
    const client = await clientModel.findById(req.params.id);
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json(client);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/clients — tambah client
router.post("/", async (req, res) => {
  try {
    const data = req.body;
    if (!data.client_id || !data.nama)
      return res.status(400).json({ error: "client_id dan nama wajib diisi" });
    const created = await clientModel.create(data);
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/clients/:id — update client
router.patch("/:id", async (req, res) => {
  try {
    const updated = await clientModel.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Client not found" });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/clients/:id — hapus client
router.delete("/:id", async (req, res) => {
  try {
    const removed = await clientModel.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: "Client not found" });
    res.json({ success: true, deleted: removed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/clients/active/instagram — client IG aktif
router.get("/active/instagram", async (req, res) => {
  try {
    const clients = await clientModel.findAllActiveWithInstagram();
    res.json(clients);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
