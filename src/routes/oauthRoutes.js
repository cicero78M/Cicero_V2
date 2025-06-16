import { Router } from 'express';
import {
  handleOAuthCallback,
  handleInstagramOAuthCallback,
  handleInstagramDeauthorize,
  removeInstagramCallback,
} from '../controller/oauthController.js';

const router = Router();

// OAuth provider redirects users to this callback URL
router.get('/callback', handleOAuthCallback);
router.get('/instagram/callback', handleInstagramOAuthCallback);
router.post('/instagram/deauthorize', handleInstagramDeauthorize);
router.delete('/instagram/callback-url', removeInstagramCallback);

export default router;
