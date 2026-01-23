/* global module */
module.exports = {
  apps: [
    {
      name: 'cicero_v2',
      script: 'app.js',
      watch: process.env.NODE_ENV === 'production' ? false : ['app.js', 'src'],
      ignore_watch: [
        'laphar',
        'logs',
        'uploads',
        'backups',
        '*.txt',
        '*.csv',
        '*.tsv',
        '*.log',
        '*.json',
        '*.xlsx',
        '*.xls',
        '*.zip'
      ]
    }
  ]
};
