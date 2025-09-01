import { EventEmitter } from 'events';
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function clearDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function createBaileysClient({ refreshAuth = false } = {}) {
  const sessionsDir = path.join('sessions', 'baileys');
  if (refreshAuth) clearDir(sessionsDir);
  ensureDir(sessionsDir);
  const { state, saveCreds } = await useMultiFileAuthState(sessionsDir);

  const emitter = new EventEmitter();
  let sock;

  const handleMessages = (m) => {
    if (m.type !== 'notify') return;
    for (const msg of m.messages) {
      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '';
      emitter.emit('message', { from: msg.key.remoteJid, body });
    }
  };

  const onConnectionUpdate = (update) => {
    if (update.qr) emitter.emit('qr', update.qr);
    if (update.connection === 'open') emitter.emit('ready');
    if (update.connection === 'close') {
      const status = update.lastDisconnect?.error?.output?.statusCode;
      emitter.emit('disconnected', update.lastDisconnect?.error);
      if (status === 515) startSock();
    }
  };

  const startSock = () => {
    try {
      sock?.end();
    } catch {}
    sock = makeWASocket({
      auth: state,
      browser: ['Ubuntu', 'Chrome', '22.04.4'],
      printQRInTerminal: false,
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', handleMessages);
    sock.ev.on('connection.update', onConnectionUpdate);
  };

  startSock();

  emitter.connect = async () => {
    // Wait until the underlying Baileys socket is ready
    if (sock.ws?.readyState === sock.ws.OPEN) return;
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onClose = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        sock.ws.off('open', onOpen);
        sock.ws.off('close', onClose);
        sock.ws.off('error', onClose);
      };
      sock.ws.on('open', onOpen);
      sock.ws.on('close', onClose);
      sock.ws.on('error', onClose);
    });
  };

  emitter.disconnect = async () => sock.end();
  emitter.sendMessage = (jid, message, options = {}) => {
    const content = typeof message === 'string' ? { text: message } : message;
    return sock.sendMessage(jid, content, options);
  };
  emitter.onMessage = (handler) => emitter.on('message', handler);
  emitter.onDisconnect = (handler) => emitter.on('disconnected', handler);
  emitter.isReady = async () => Boolean(sock.authState?.creds?.me);
  emitter.getState = async () => (await emitter.isReady()) ? 'open' : 'close';

  return emitter;
}

export function refreshAuthState() {
  const sessionsDir = path.join('sessions', 'baileys');
  clearDir(sessionsDir);
}

export async function requestPairingCode(phoneNumber, { refreshAuth = false } = {}) {
  const sessionsDir = path.join('sessions', 'baileys');
  if (refreshAuth) clearDir(sessionsDir);
  ensureDir(sessionsDir);
  const { state, saveCreds } = await useMultiFileAuthState(sessionsDir);

  const sock = makeWASocket({
    auth: state,
    browser: ['Ubuntu', 'Chrome', '22.04.4'],
    printQRInTerminal: false,
  });
  sock.ev.on('creds.update', saveCreds);
  try {
    const code = await sock.requestPairingCode(phoneNumber);
    return code;
  } finally {
    await sock.end();
  }
}
