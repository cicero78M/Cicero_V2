import { google } from 'googleapis';
import * as XLSX from 'xlsx';

export async function exportRowsToGoogleSheet(rows, fileName = 'Data Rekap Bulan Tahun') {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) {
    const err = new Error('Missing Google credentials');
    err.statusCode = 500;
    throw err;
  }

  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive'
    ]
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const createRes = await sheets.spreadsheets.create({
    requestBody: { properties: { title: fileName } }
  });

  const sheetId = createRes.data.spreadsheetId;

  const header = [
    'Date',
    'Pangkat Nama',
    'Satfung',
    'Link Instagram',
    'Link Facebook',
    'Link Twitter',
    'Link Tiktok',
    'Link Youtube'
  ];

  const values = rows.map((r) => [
    r.date || '',
    r.pangkat_nama || '',
    r.satfung || '',
    r.instagram || '',
    r.facebook || '',
    r.twitter || '',
    r.tiktok || '',
    r.youtube || ''
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Sheet1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [header, ...values] }
  });

  return sheetId;
}

export function generateLinkReportExcelBuffer(rows) {
  const header = [
    'Date',
    'Pangkat Nama',
    'NRP',
    'Satfung',
    'Link Instagram',
    'Link Facebook',
    'Link Twitter',
    'Link Tiktok',
    'Link Youtube'
  ];
  const data = rows.map((r) => [
    r.date || '',
    r.pangkat_nama || '',
    r.nrp || '',
    r.satfung || '',
    r.instagram || '',
    r.facebook || '',
    r.twitter || '',
    r.tiktok || '',
    r.youtube || ''
  ]);
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}
