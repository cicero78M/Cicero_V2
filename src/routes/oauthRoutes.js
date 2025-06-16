import { Router } from 'express';
import {
  handleOAuthCallback,
  handleInstagramOAuthCallback,
  handleInstagramDeauthorize,
} from '../controller/oauthController.js';

const router = Router();

// OAuth provider redirects users to this callback URL
router.get('/callback', handleOAuthCallback);
router.get('/instagram/callback', handleInstagramOAuthCallback);
router.post('/instagram/deauthorize', handleInstagramDeauthorize);

export default router;
