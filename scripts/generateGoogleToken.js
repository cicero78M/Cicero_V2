import { google } from 'googleapis';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'fs/promises';

const SCOPES = ['https://www.googleapis.com/auth/contacts'];

async function main() {
  const credPath = process.argv[2] || process.env.GOOGLE_CREDENTIALS_PATH || 'credentials.json';
  const tokenPath = process.argv[3] || process.env.GOOGLE_TOKEN_PATH || 'token.json';
  const content = await fs.readFile(credPath, 'utf8');
  const { client_secret, client_id, redirect_uris } = JSON.parse(content).installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('Authorize this app by visiting this url:\n', authUrl);
  const rl = readline.createInterface({ input, output });
  const code = await rl.question('Enter the code from that page here: ');
  rl.close();
  const { tokens } = await oAuth2Client.getToken(code.trim());
  await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2));
  console.log('Token stored to', tokenPath);
}

main().catch(err => {
  console.error('Error generating token:', err.message);
});
