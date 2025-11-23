import * as officialAccountRepository from '../repository/officialAccountRepository.js';

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

function normalizeRole(role) {
  return typeof role === 'string' ? role.trim().toLowerCase().replace(/[\s_-]+/g, '') : '';
}

function normalizeClientId(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function getAllowedClientIds(req) {
  const ids = req.user?.client_ids || (req.user?.client_id ? [req.user.client_id] : []);
  return (ids || []).map(normalizeClientId).filter(Boolean);
}

function respond(res, status, message) {
  res.status(status).json({ success: false, message });
  return null;
}

async function resolveClientScope({ req, res, allowedClientIds, normalizedRole }) {
  const method = req.method.toUpperCase();
  const isIdAction = req.params?.official_account_id && ['PUT', 'DELETE'].includes(method);
  let targetClientId = req.query?.client_id || req.body?.client_id;

  if (isIdAction) {
    const existing = await officialAccountRepository.findById(req.params.official_account_id);
    if (!existing) {
      return respond(res, 404, 'Official account not found');
    }
    req.officialAccount = existing;
    targetClientId = existing.client_id;
  }

  let normalizedTarget = normalizeClientId(targetClientId);

  if (!normalizedTarget && allowedClientIds.length === 1) {
    [normalizedTarget] = allowedClientIds;
    if (method === 'GET' && !req.query?.client_id) {
      req.query.client_id = normalizedTarget;
    }
    if (method === 'POST' && !req.body?.client_id) {
      req.body.client_id = normalizedTarget;
    }
  }

  if (!normalizedTarget) {
    return respond(res, 400, 'client_id is required for this action');
  }

  if (
    allowedClientIds.length &&
    !allowedClientIds.includes(normalizedTarget) &&
    normalizedRole !== 'ditbinmas'
  ) {
    return respond(res, 403, 'Forbidden: client access is limited to assigned client_id');
  }

  return normalizedTarget;
}

export async function officialAccountAccess(req, res, next) {
  const normalizedRole = normalizeRole(req.user?.role);
  const allowedClientIds = getAllowedClientIds(req);
  const method = req.method.toUpperCase();
  const isWrite = WRITE_METHODS.includes(method);

  if (normalizedRole === 'bhabinkamtibmas') {
    if (isWrite) {
      return respond(res, 403, 'Read-only: Bhabinkamtibmas cannot modify official accounts');
    }
    const scoped = await resolveClientScope({ req, res, allowedClientIds, normalizedRole });
    if (!scoped) return null;
    return next();
  }

  if (normalizedRole === 'polres' || normalizedRole === 'kasatbinmas') {
    if (!allowedClientIds.length) {
      return respond(res, 403, 'Client access is not configured for this user');
    }
    const scoped = await resolveClientScope({ req, res, allowedClientIds, normalizedRole });
    if (!scoped) return null;
    return next();
  }

  if (normalizedRole === 'ditbinmas') {
    if (isWrite) {
      const scoped = await resolveClientScope({ req, res, allowedClientIds: [], normalizedRole });
      if (!scoped) return null;
    }
    return next();
  }

  if (isWrite && allowedClientIds.length) {
    const scoped = await resolveClientScope({ req, res, allowedClientIds, normalizedRole });
    if (!scoped) return null;
  }

  return next();
}
