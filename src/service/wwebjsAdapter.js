import { EventEmitter } from 'events';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth, MessageMedia } = pkg;

/**
 * Create a whatsapp-web.js client that matches the WAAdapter contract.
 * The client stays in standby mode and does not mark messages as read
 * unless explicitly invoked.
 *
 * @param {string} [clientId='wa-admin'] - WhatsApp client identifier used by LocalAuth.
 */
export async function createWwebjsClient(clientId = 'wa-admin') {
  const emitter = new EventEmitter();
  const client = new Client({
    authStrategy: new LocalAuth({ clientId }),
    puppeteer: { args: ['--no-sandbox'], headless: true },
  });

  client.on('qr', (qr) => emitter.emit('qr', qr));
  client.on('ready', async () => {
    await client.pupPage.evaluate(() => {
      if (
        window.Store?.WidFactory &&
        !window.Store.WidFactory.toUserWidOrThrow
      ) {
        window.Store.WidFactory.toUserWidOrThrow = (jid) =>
          window.Store.WidFactory.createWid(jid);
      }
    });
    emitter.emit('ready');
  });
  client.on('disconnected', (reason) => emitter.emit('disconnected', reason));
  client.on('message', async (msg) => {
    let contactMeta = {};
    try {
      const contact = await msg.getContact();
      contactMeta = {
        contactName: contact?.name || null,
        contactPushname: contact?.pushname || null,
        isMyContact: contact?.isMyContact ?? null,
      };
    } catch (err) {
      contactMeta = { error: err?.message || 'contact_fetch_failed' };
    }
    emitter.emit('message', {
      from: msg.from,
      body: msg.body,
      id: msg.id,
      author: msg.author,
      timestamp: msg.timestamp,
      ...contactMeta,
    });
  });

  emitter.connect = async () => {
    await client.initialize();
  };

  emitter.disconnect = async () => {
    await client.destroy();
  };

  emitter.sendMessage = async (jid, content, options = {}) => {
    let message;
    if (
      content &&
      typeof content === 'object' &&
      'document' in content
    ) {
      const media = new MessageMedia(
        content.mimetype || 'application/octet-stream',
        Buffer.from(content.document).toString('base64'),
        content.fileName
      );
      message = await client.sendMessage(jid, media, {
        ...options,
        sendMediaAsDocument: true,
      });
    } else {
      const text = typeof content === 'string' ? content : content.text;
      message = await client.sendMessage(jid, text, options);
    }
    return message.id._serialized || message.id.id || '';
  };

  emitter.onMessage = (handler) => emitter.on('message', handler);
  emitter.onDisconnect = (handler) => emitter.on('disconnected', handler);
  emitter.isReady = async () => client.info !== undefined;
  emitter.getState = async () => {
    try {
      return await client.getState();
    } catch {
      return 'close';
    }
  };

  emitter.sendSeen = async (jid) => {
    try {
      return await client.sendSeen(jid);
    } catch (err) {
      console.warn('[WWEBJS] sendSeen failed:', err?.message || err);
      return false;
    }
  };

  emitter.getContact = async (jid) => {
    try {
      const contact = await client.getContactById(jid);
      return contact;
    } catch (err) {
      console.warn('[WWEBJS] getContact failed:', err?.message || err);
      return null;
    }
  };

  return emitter;
}
