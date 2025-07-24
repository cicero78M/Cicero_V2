import { google } from 'googleapis';

export async function createLinkReportSheet(rows, title, clientId, monthName) {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  console.log(`[GOOGLE] Using service account: ${serviceAccountEmail}`);
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: serviceAccountEmail,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    },
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets'
    ]
  });
  const client = await auth.getClient();
  console.log('[GOOGLE] Service account authenticated');
  const sheets = google.sheets({ version: 'v4', auth: client });
  const drive = google.drive({ version: 'v3', auth: client });

  console.log('[GOOGLE] Creating new spreadsheet');
  const createRes = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [process.env.GOOGLE_SHEET_FOLDER_ID || 'Sheet_Cicero']
    },
    fields: 'id'
  });
  const spreadsheetId = createRes.data.id;
  console.log(`[GOOGLE] Spreadsheet created with ID: ${spreadsheetId}`);

  const newName = `${clientId}_${monthName} Rekap`;
  console.log(`[GOOGLE] Renaming spreadsheet to: ${newName}`);
  await drive.files.update({
    fileId: spreadsheetId,
    requestBody: { name: newName }
  });
  console.log('[GOOGLE] Setting spreadsheet permissions to public read');
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: {
      type: 'anyone',
      role: 'reader'
    }
  });

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
  const values = [
    header,
    ...rows.map(r => [
      r.date || '',
      r.pangkat_nama || '',
      r.satfung || '',
      r.instagram || '',
      r.facebook || '',
      r.twitter || '',
      r.tiktok || '',
      r.youtube || ''
    ])
  ];

  console.log(`[GOOGLE] Writing ${values.length - 1} data rows to spreadsheet`);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Sheet1!A1',
    valueInputOption: 'RAW',
    requestBody: { values }
  });

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}
