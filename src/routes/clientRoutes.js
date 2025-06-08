import express from 'express';
import * as clientController from '../controller/clientController.js';

const router = express.Router();

// === CRUD Dasar ===
router.get('/', clientController.getAllClients);
router.get('/active', clientController.getActiveClients);
router.get('/:client_id', clientController.getClientById);
router.put('/:client_id', clientController.updateClient);
router.delete('/:client_id', clientController.deleteClient);

// === Visualisasi Data / Analytics ===
// Semua user di bawah client
router.get('/:client_id/users', clientController.getUsers);

// Semua posting Instagram milik client
router.get('/:client_id/posts/instagram', clientController.getInstagramPosts);
// Semua like per posting Instagram client
router.get('/:client_id/posts/instagram/likes', clientController.getInstagramLikes);

// Semua posting TikTok milik client
router.get('/:client_id/posts/tiktok', clientController.getTiktokPosts);
// Semua komentar per posting TikTok client
router.get('/:client_id/posts/tiktok/comments', clientController.getTiktokComments);

// Ringkasan aktivitas client (dashboard)
router.get('/:client_id/summary', clientController.getSummary);

router.get('/profile', async (req, res) => {
  const client_id = req.query.client_id || req.user?.client_id;
  if (!client_id) return res.status(400).json({ success: false, message: 'client_id required' });

  try {
    const { rows } = await pool.query('SELECT * FROM clients WHERE client_id = $1', [client_id]);
    const client = rows[0];
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });

    res.json({ success: true, profile: client });
  } catch (err) {
    res.status(500).json({ success: false, message: 'DB error', error: err.message });
  }
});


export default router;
