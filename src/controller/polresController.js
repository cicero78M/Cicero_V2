import { searchAndRegisterPolres } from '../service/polresAccountService.js';
import { sendSuccess } from '../utils/response.js';

export async function searchPolresAccounts(req, res, next) {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'q parameter required' });
    const usernames = await searchAndRegisterPolres(q);
    sendSuccess(res, { usernames });
  } catch (err) {
    next(err);
  }
}
