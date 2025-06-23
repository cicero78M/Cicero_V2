import * as linkReportModel from '../model/linkReportModel.js';
import { sendSuccess } from '../utils/response.js';

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
    const report = await linkReportModel.findLinkReportByShortcode(req.params.shortcode);
    sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
}

export async function createLinkReport(req, res, next) {
  try {
    const report = await linkReportModel.createLinkReport(req.body);
    sendSuccess(res, report, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateLinkReport(req, res, next) {
  try {
    const report = await linkReportModel.updateLinkReport(req.params.shortcode, req.body);
    sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
}

export async function deleteLinkReport(req, res, next) {
  try {
    const report = await linkReportModel.deleteLinkReport(req.params.shortcode);
    sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
}
