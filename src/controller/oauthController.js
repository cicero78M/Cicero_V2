import { env } from '../config/env.js';
import { verifySignedRequest } from '../utils/instagramWebhooks.js';
import { deleteInstagramCallback } from '../service/instagramApi.js';

/**
 * Handle OAuth provider callback.
 * Example usage: GET /oauth/callback?code=AUTH_CODE&state=STATE
 */
export async function handleOAuthCallback(req, res) {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ success: false, message: 'Missing code parameter' });
  }

  console.log('[OAUTH CALLBACK]', { code, state });

  // Placeholder: exchange code for access token using provider API
  // You can add provider-specific logic here.

  return res.status(200).json({ success: true, code, state });
}

/**
 * Instagram OAuth callback handler.
 * Exchanges the provided code for an access token using Instagram's API.
 */
export async function handleInstagramOAuthCallback(req, res) {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ success: false, message: 'Missing code parameter' });
  }

  console.log('[IG OAUTH CALLBACK]', { code, state });

  const params = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID,
    client_secret: env.INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: env.INSTAGRAM_REDIRECT_URI,
    code,
  });

  try {
    const response = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: params,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Instagram API error ${response.status}: ${text}`);
    }

    const data = await response.json();
    console.log('[IG OAUTH TOKEN]', data);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[IG OAUTH ERROR]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve Instagram token' });
  }
}

/**
 * Instagram deauthorization callback handler.
 * Validates the signed_request sent by Instagram when a user revokes access.
 */
export async function handleInstagramDeauthorize(req, res) {
  const { signed_request } = req.body || {};

  if (!signed_request) {
    return res
      .status(400)
      .json({ success: false, message: 'Missing signed_request' });
  }

  try {
    const payload = verifySignedRequest(
      signed_request,
      env.INSTAGRAM_APP_SECRET
    );
    console.log('[IG DEAUTH]', payload);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[IG DEAUTH ERROR]', err.message);
    return res
      .status(400)
      .json({ success: false, message: 'Invalid signed_request' });
  }
}

export async function removeInstagramCallback(req, res) {
  try {
    const result = await deleteInstagramCallback();
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[IG REMOVE CALLBACK ERROR]', err.message);
    const code = err.statusCode || err.response?.status || 500;
    return res.status(code).json({ success: false, message: err.message });
  }
}

