import { getRekapLinkByClient } from '../model/linkReportModel.js';
import { sendConsoleDebug } from '../middleware/debugHandler.js';

export async function getAmplifyRekap(req, res) {
  const client_id = req.query.client_id;
  const periode = req.query.periode || 'harian';
  const tanggal = req.query.tanggal;
  const startDate =
    req.query.start_date || req.query.tanggal_mulai;
  const endDate = req.query.end_date || req.query.tanggal_selesai;
  if (!client_id) {
    return res.status(400).json({ success: false, message: 'client_id wajib diisi' });
  }
  if (req.user?.client_ids && !req.user.client_ids.includes(client_id)) {
    return res.status(403).json({ success: false, message: 'client_id tidak diizinkan' });
  }
  if (req.user?.client_id && req.user.client_id !== client_id) {
    return res.status(403).json({ success: false, message: 'client_id tidak diizinkan' });
  }
  try {
    sendConsoleDebug({
      tag: 'AMPLIFY',
      msg: `getAmplifyRekap ${client_id} ${periode} ${tanggal || ''} ${startDate || ''} ${endDate || ''}`
    });
    const role = req.user?.role;
    const data = await getRekapLinkByClient(
      client_id,
      periode,
      tanggal,
      startDate,
      endDate,
      role
    );
    const length = Array.isArray(data) ? data.length : 0;
    const chartHeight = Math.max(length * 30, 300);
    res.json({ success: true, data, chartHeight });
  } catch (err) {
    sendConsoleDebug({ tag: 'AMPLIFY', msg: `Error getAmplifyRekap: ${err.message}` });
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}


