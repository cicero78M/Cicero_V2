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
  {
    jobKey: './src/cron/cronDashboardPremiumRequestExpiry.js',
    modulePath: './src/cron/cronDashboardPremiumRequestExpiry.js',
    bucket: 'waClient',
    description:
      'Expire stale dashboard premium access requests and optionally notify applicants via WhatsApp.',
  },
  {
    jobKey: './src/cron/cronDashboardSubscriptionExpiry.js',
    modulePath: './src/cron/cronDashboardSubscriptionExpiry.js',
    bucket: 'waClient',
    description: 'Expire overdue dashboard subscriptions and notify users via WhatsApp.',
  },
];
