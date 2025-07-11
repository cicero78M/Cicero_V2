import * as linkReportModel from '../model/linkReportModel.js';
import { sendSuccess } from '../utils/response.js';
import { extractFirstUrl } from '../utils/utilsHelper.js';

export async function getAllLinkReports(req, res, next) {
  try {
    const data = await linkReportModel.getLinkReports();
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getLinkReportByShortcode(req, res, next) {
  try {
    const report = await linkReportModel.findLinkReportByShortcode(
      req.params.shortcode,
      req.query.user_id
    );
    sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
}

export async function createLinkReport(req, res, next) {
  try {
    const data = { ...req.body };
    [
      'instagram_link',
      'facebook_link',
      'twitter_link',
      'tiktok_link',
      'youtube_link'
    ].forEach((f) => {
      if (data[f]) data[f] = extractFirstUrl(data[f]);
    });
    const report = await linkReportModel.createLinkReport(data);
    sendSuccess(res, report, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateLinkReport(req, res, next) {
  try {
    const bodyData = { ...req.body };
    [
      'instagram_link',
      'facebook_link',
      'twitter_link',
      'tiktok_link',
      'youtube_link'
    ].forEach((f) => {
      if (bodyData[f]) bodyData[f] = extractFirstUrl(bodyData[f]);
    });
    const report = await linkReportModel.updateLinkReport(
      req.params.shortcode,
      bodyData.user_id,
      bodyData
    );
    sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
}

export async function deleteLinkReport(req, res, next) {
  try {
    const report = await linkReportModel.deleteLinkReport(
      req.params.shortcode,
      req.query.user_id
    );
    sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
}
