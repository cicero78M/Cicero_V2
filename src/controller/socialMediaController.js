import { analyzeInstagramData } from '../utils/analyzeInstagram.js';

export function analyzeInstagramJson(req, res) {
  try {
    const json = req.body;
    const result = analyzeInstagramData(json);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
