import { EventEmitter } from 'events';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function createWwebClient() {
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: process.env.APP_SESSION_NAME,
    }),
    puppeteer: {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 10000,
  });

  client.connect = () => client.initialize();
  client.disconnect = () => client.destroy();
  client.onMessage = (handler) => client.on('message', handler);
  client.onDisconnect = (handler) => client.on('disconnected', handler);
  client.isReady = async () => {
    try {
      const state = await client.getState();
      return state === 'CONNECTED';
    } catch {
      return false;
    }
  };
  // Display QR via console
  client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
  return client;
}

export async function createBaileysClient() {
  const sessionsDir = path.join('sessions', 'baileys');
  ensureDir(sessionsDir);
  const { state, saveCreds } = await useMultiFileAuthState(sessionsDir);
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });
  sock.ev.on('creds.update', saveCreds);

  const emitter = new EventEmitter();

  emitter.connect = async () => {};
  emitter.disconnect = async () => sock.end();
  emitter.sendMessage = (jid, message, options = {}) =>
    sock.sendMessage(jid, { text: message }, options);
  emitter.onMessage = (handler) => emitter.on('message', handler);
  emitter.onDisconnect = (handler) => emitter.on('disconnected', handler);
  emitter.isReady = async () => Boolean(sock.authState?.creds?.me);
  emitter.getState = async () => (await emitter.isReady()) ? 'open' : 'close';

  sock.ev.on('messages.upsert', (m) => {
    if (m.type !== 'notify') return;
    for (const msg of m.messages) {
      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '';
      emitter.emit('message', { from: msg.key.remoteJid, body });
    }
  });

  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'open') emitter.emit('ready');
    if (update.connection === 'close') emitter.emit('disconnected', update.lastDisconnect?.error);
  });

  return emitter;
}
