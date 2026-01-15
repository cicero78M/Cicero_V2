const seen = new Set();

/**
 * Deduplicate incoming messages from multiple adapters.
 * Messages received via wwebjs are preferred; baileys messages are delayed
 * briefly to allow wwebjs to handle the message first.
 * @param {'baileys'|'wwebjs'} fromAdapter
 * @param {object} msg
 * @param {(msg: object) => void} handler
 */
export function handleIncoming(fromAdapter, msg, handler) {
  const jid = msg.key?.remoteJid || msg.from;
  const id = msg.key?.id || msg.id?.id || msg.id?._serialized;
  if (!jid || !id) {
    handler(msg);
    return;
  }
  const key = `${jid}:${id}`;
  if (seen.has(key)) return;

  if (fromAdapter === "baileys") {
    setTimeout(() => {
      if (seen.has(key)) return;
      seen.add(key);
      handler(msg);
    }, 200);
    return;
  }

  seen.add(key);
  handler(msg);
}
