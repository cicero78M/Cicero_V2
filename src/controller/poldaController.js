import { initPolda } from '../service/poldaService.js';
import { searchAllCities, fetchInfoForAllUsers } from '../service/instaSearchService.js';
import { sendSuccess } from '../utils/response.js';

export async function init(req, res, next) {
  try {
    await initPolda();
    sendSuccess(res, { initialized: true });
  } catch (err) {
    next(err);
  }
}

export async function searchInstagram(req, res, next) {
  try {
    await searchAllCities();
    sendSuccess(res, { done: true });
  } catch (err) {
    next(err);
  }
}

export async function fetchInfo(req, res, next) {
  try {
    await fetchInfoForAllUsers();
    sendSuccess(res, { done: true });
  } catch (err) {
    next(err);
  }
}
