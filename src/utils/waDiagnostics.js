/**
 * WhatsApp Service Diagnostics Utility
 * Helps diagnose message reception issues
 */

export function logWaServiceDiagnostics(waClient, waUserClient, waGatewayClient) {
  const clients = [
    { name: 'waClient', client: waClient },
    { name: 'waUserClient', client: waUserClient },
    { name: 'waGatewayClient', client: waGatewayClient },
  ];

  console.log('\n========== WA SERVICE DIAGNOSTICS ==========');
  console.log(`WA_SERVICE_SKIP_INIT: ${process.env.WA_SERVICE_SKIP_INIT || 'not set'}`);
  console.log(`Should Init Clients: ${process.env.WA_SERVICE_SKIP_INIT !== 'true'}`);

  clients.forEach(({ name, client }) => {
    console.log(`\n--- ${name} ---`);
    console.log(`  Client exists: ${!!client}`);
    console.log(`  Is EventEmitter: ${typeof client?.on === 'function'}`);
    console.log(`  Has connect method: ${typeof client?.connect === 'function'}`);
    console.log(`  Has sendMessage method: ${typeof client?.sendMessage === 'function'}`);
    
    // Check if message listeners are attached
    if (client && typeof client.listenerCount === 'function') {
      console.log(`  'message' listener count: ${client.listenerCount('message')}`);
      console.log(`  'ready' listener count: ${client.listenerCount('ready')}`);
      console.log(`  'qr' listener count: ${client.listenerCount('qr')}`);
    }
  });

  console.log('\n===========================================\n');
}

export function checkMessageListenersAttached(waClient, waUserClient, waGatewayClient) {
  const clients = [
    { name: 'waClient', client: waClient },
    { name: 'waUserClient', client: waUserClient },
    { name: 'waGatewayClient', client: waGatewayClient },
  ];

  let allGood = true;
  clients.forEach(({ name, client }) => {
    if (!client) {
      console.error(`[WA DIAGNOSTICS] ${name} is not defined!`);
      allGood = false;
      return;
    }

    if (typeof client.listenerCount !== 'function') {
      console.warn(`[WA DIAGNOSTICS] ${name} does not have listenerCount method`);
      return;
    }

    const messageListeners = client.listenerCount('message');
    if (messageListeners === 0) {
      console.error(`[WA DIAGNOSTICS] ${name} has NO 'message' event listeners attached!`);
      console.error(`[WA DIAGNOSTICS] This means messages will NOT be received by this client.`);
      console.error(`[WA DIAGNOSTICS] Check if WA_SERVICE_SKIP_INIT is set to 'true'`);
      allGood = false;
    } else {
      console.log(`[WA DIAGNOSTICS] ✓ ${name} has ${messageListeners} 'message' listener(s)`);
    }
  });

  if (!allGood) {
    console.error('\n[WA DIAGNOSTICS] ⚠️  MESSAGE RECEPTION ISSUE DETECTED!');
    console.error('[WA DIAGNOSTICS] The WhatsApp bot will NOT be able to receive messages.');
    console.error('[WA DIAGNOSTICS] Please check your environment configuration.\n');
  } else {
    console.log('\n[WA DIAGNOSTICS] ✓ All message listeners are properly attached.\n');
  }

  return allGood;
}
