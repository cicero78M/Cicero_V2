import * as linkReportModel from '../model/linkReportModel.js';
import { sendSuccess } from '../utils/response.js';
import { extractFirstUrl } from '../utils/utilsHelper.js';
import { generateLinkReportExcelBuffer } from '../service/amplifyExportService.js';
import waClient, { waReady } from '../service/waService.js';
import { findUserById } from '../model/userModel.js';
import { formatToWhatsAppId, safeSendMessage } from '../utils/waHelper.js';

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

    if (waReady && data.user_id) {
      const user = await findUserById(data.user_id);
      if (user?.whatsapp) {
        const wid = formatToWhatsAppId(user.whatsapp);
        const msg =
          'Terimakasih,\n' +
          'Anda sudah melaksnakan Tugas Amplifikasi Konten dari Akun official :\n\n' +
          `Link Tugas: https://www.instagram.com/p/${data.shortcode}\n\n` +
          'Laporan Link Anda sebagai berikut :\n\n' +
          ` - Link Facebook : ${report.facebook_link || '-'}\n` +
          ` - Link Instagram : ${report.instagram_link || '-'}\n` +
          ` - Link Twitter : ${report.twitter_link || '-'}\n` +
          ` - Link Tiktok : ${report.tiktok_link || '-'}\n` +
          ` - Link Youtube : ${report.youtube_link || '-'}\n`;
        await safeSendMessage(waClient, wid, msg);
      }
    }

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

export async function downloadMonthlyLinkReportExcel(req, res, next) {
  try {
    const clientId = req.query.client_id;
    if (!clientId) {
      return res
        .status(400)
        .json({ success: false, message: 'client_id wajib diisi' });
    }
    const rows = await linkReportModel.getReportsThisMonthByClient(clientId);
    const buffer = generateLinkReportExcelBuffer(rows);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="link_report.xlsx"'
    );
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}
