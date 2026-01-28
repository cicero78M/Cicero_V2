const seen = new Set();

/**
 * Deduplicate incoming messages from multiple adapters.
 * Messages received via wwebjs are preferred; baileys messages are delayed
 * briefly to allow wwebjs to handle the message first.
 * @param {string} fromAdapter
 * @param {object} msg
 * @param {(msg: object) => void} handler
 * @param {{ allowReplay?: boolean }} [options]
 */
export function handleIncoming(fromAdapter, msg, handler, options = {}) {
  const { allowReplay = false } = options;
  const jid = msg.key?.remoteJid || msg.from;
  const id = msg.key?.id || msg.id?.id || msg.id?._serialized;
  const invokeHandler = () =>
    Promise.resolve(handler(msg)).catch((error) => {
      console.error("[WA] handler error", {
        jid,
        id,
        fromAdapter,
        error,
      });
    });
  if (!jid || !id) {
    invokeHandler();
    return;
  }
  const key = `${jid}:${id}`;
  if (allowReplay) {
    seen.add(key);
    invokeHandler();
    return;
  }
  if (seen.has(key)) return;

  if (fromAdapter === "baileys") {
    setTimeout(() => {
      if (seen.has(key)) return;
      seen.add(key);
      invokeHandler();
    }, 200);
    return;
  }

  seen.add(key);
  invokeHandler();
}
