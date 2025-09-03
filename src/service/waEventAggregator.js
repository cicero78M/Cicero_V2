const seen = new Set();

/**
 * Deduplicate incoming messages from multiple adapters.
 * @param {'baileys'|'wwebjs'} fromAdapter
 * @param {object} msg
 * @param {(msg: object) => void} handler
 */
export function handleIncoming(fromAdapter, msg, handler) {
  const jid = msg.key?.remoteJid || msg.from;
  const id = msg.key?.id || msg.id?.id || msg.id?._serialized;
  const key = `${jid}:${id}`;
  if (seen.has(key)) return;
  seen.add(key);
  handler(msg);
}
