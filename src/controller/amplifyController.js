import { getRekapLinkByClient } from '../model/linkReportModel.js';
import { sendConsoleDebug } from '../middleware/debugHandler.js';

export async function getAmplifyRekap(req, res) {
  const client_id = req.query.client_id;
  const periode = req.query.periode || 'harian';
  if (!client_id) {
    return res.status(400).json({ success: false, message: 'client_id wajib diisi' });
  }
  try {
    sendConsoleDebug({ tag: 'AMPLIFY', msg: `getAmplifyRekap ${client_id} ${periode}` });
    const data = await getRekapLinkByClient(client_id, periode);
    res.json({ success: true, data });
  } catch (err) {
    sendConsoleDebug({ tag: 'AMPLIFY', msg: `Error getAmplifyRekap: ${err.message}` });
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}


