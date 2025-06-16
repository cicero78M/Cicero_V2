import { Router } from 'express';
import {
  handleOAuthCallback,
  handleInstagramOAuthCallback,
} from '../controller/oauthController.js';

const router = Router();

// OAuth provider redirects users to this callback URL
router.get('/callback', handleOAuthCallback);
router.get('/instagram/callback', handleInstagramOAuthCallback);

export default router;
