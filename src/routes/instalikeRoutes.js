import express from 'express';
import * as instaLikeController from '../controller/instaLikeController.js';

const router = express.Router();

// Like endpoints
router.get('/like', instaLikeController.getAll);
router.get('/like/:id', instaLikeController.getById);
router.post('/like', instaLikeController.create);
router.put('/like/:id', instaLikeController.update);
router.delete('/like/:id', instaLikeController.remove);

export default router;
