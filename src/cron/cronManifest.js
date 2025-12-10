export default [
  {
    jobKey: './src/cron/cronDbBackup.js',
    modulePath: './src/cron/cronDbBackup.js',
    bucket: 'always',
    description: 'Backup database dump to Google Drive using service account credentials.',
  },
  {
    jobKey: './src/cron/cronRekapLink.js',
    modulePath: './src/cron/cronRekapLink.js',
    bucket: 'waClient',
    description: 'Distribute amplification link recaps to all active amplification clients.',
  },
  {
    jobKey: './src/cron/cronAmplifyLinkMonthly.js',
    modulePath: './src/cron/cronAmplifyLinkMonthly.js',
    bucket: 'waClient',
    description: 'Generate and deliver monthly amplification spreadsheets on the last day of the month.',
  },
  {
    jobKey: './src/cron/cronDirRequestRekapUpdate.js',
    modulePath: './src/cron/cronDirRequestRekapUpdate.js',
    bucket: 'waClient',
    description: 'Send Ditbinmas executive summaries and rekap updates to admins and broadcast groups.',
  },
  {
    jobKey: './src/cron/cronDirRequestRekapBelumLengkapDitsamapta.js',
    modulePath: './src/cron/cronDirRequestRekapBelumLengkapDitsamapta.js',
    bucket: 'waClient',
    description: 'Send Ditsamapta incomplete Instagram/TikTok data recaps to admin recipients only.',
  },
];
