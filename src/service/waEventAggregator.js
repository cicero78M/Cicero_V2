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
  
  console.log(`[WA-EVENT-AGGREGATOR] Message received from adapter: ${fromAdapter}, jid: ${jid}, id: ${id}`);
  
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
    console.log(`[WA-EVENT-AGGREGATOR] Invoking handler without jid/id (jid: ${jid}, id: ${id})`);
    invokeHandler();
    return;
  }
  const key = `${jid}:${id}`;
  if (allowReplay) {
    console.log(`[WA-EVENT-AGGREGATOR] Allowing replay for message: ${key}`);
    seen.add(key);
    invokeHandler();
    return;
  }
  if (seen.has(key)) {
    console.log(`[WA-EVENT-AGGREGATOR] Duplicate message detected, skipping: ${key}`);
    return;
  }

  if (fromAdapter === "baileys") {
    console.log(`[WA-EVENT-AGGREGATOR] Baileys message, delaying 200ms: ${key}`);
    setTimeout(() => {
      if (seen.has(key)) {
        console.log(`[WA-EVENT-AGGREGATOR] Baileys message already handled: ${key}`);
        return;
      }
      console.log(`[WA-EVENT-AGGREGATOR] Processing delayed baileys message: ${key}`);
      seen.add(key);
      invokeHandler();
    }, 200);
    return;
  }

  console.log(`[WA-EVENT-AGGREGATOR] Processing wwebjs message: ${key}`);
  seen.add(key);
  invokeHandler();
}
