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

export default router;
