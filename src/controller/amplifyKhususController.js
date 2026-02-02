import { getRekapLinkByClient } from '../model/linkReportKhususModel.js';
import { sendConsoleDebug } from '../middleware/debugHandler.js';

export async function getAmplifyKhususRekap(req, res) {
  const client_id = req.query.client_id;
  const periode = req.query.periode || 'harian';
  const tanggal = req.query.tanggal;
  const requestedRole = req.query.role;
  const requestedScope = req.query.scope;
  const roleLower = requestedRole ? String(requestedRole).toLowerCase() : null;
  const scopeLower = requestedScope
    ? String(requestedScope).toLowerCase()
    : null;
  const usesStandardPayload = Boolean(requestedScope && requestedRole);

  if (!client_id) {
    return res.status(400).json({ success: false, message: 'client_id wajib diisi' });
  }
  if (req.user?.client_ids && !req.user.client_ids.includes(client_id)) {
    return res.status(403).json({ success: false, message: 'client_id tidak diizinkan' });
  }

  try {
    let roleForQuery = null;

    if (usesStandardPayload) {
      if (!scopeLower) {
        return res
          .status(400)
          .json({ success: false, message: 'scope wajib diisi' });
      }
      if (!roleLower) {
        return res
          .status(400)
          .json({ success: false, message: 'role wajib diisi' });
      }
      if (!['org', 'direktorat'].includes(scopeLower)) {
        return res
          .status(400)
          .json({ success: false, message: 'scope tidak valid' });
      }

      if (scopeLower === 'org' && roleLower === 'operator') {
        const tokenClientId = req.user?.client_id;
        if (!tokenClientId) {
          return res.status(400).json({
            success: false,
            message: 'client_id pengguna tidak ditemukan'
          });
        }
        roleForQuery = 'operator';
      }
    }

    sendConsoleDebug({ 
      tag: 'AMPLIFY_KHUSUS', 
      msg: `getAmplifyKhususRekap ${client_id} ${periode} ${tanggal || ''} ${roleLower || ''} ${scopeLower || ''}` 
    });
    const data = await getRekapLinkByClient(client_id, periode, tanggal, roleForQuery);
    res.json({ success: true, data });
  } catch (err) {
    sendConsoleDebug({ tag: 'AMPLIFY_KHUSUS', msg: `Error getAmplifyKhususRekap: ${err.message}` });
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}
