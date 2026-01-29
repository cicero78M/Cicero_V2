# WhatsApp Message Reception Troubleshooting Guide

## Problem

The WhatsApp bot cannot read chat messages or receive messages, causing all menu request methods via wabot to fail.

## Common Causes

### 1. WA_SERVICE_SKIP_INIT Environment Variable

**Symptom**: Bot does not respond to any messages whatsoever.

**Cause**: The `WA_SERVICE_SKIP_INIT` environment variable is set to `"true"`.

**Impact**: When this variable is `"true"`:
- Message event listeners are NOT attached to WhatsApp clients
- Clients are NOT initialized
- No messages can be received
- Bot is completely non-functional for message handling

**Solution**:
```bash
# Check if the variable is set
echo $WA_SERVICE_SKIP_INIT

# If it shows "true", unset it or set to "false"
unset WA_SERVICE_SKIP_INIT
# OR
export WA_SERVICE_SKIP_INIT="false"

# Then restart the application
npm restart
```

**Note**: This variable should ONLY be set to `"true"` during automated testing. NEVER in production.

### 2. Client Not Ready

**Symptom**: Users receive "🤖 Bot sedang memuat, silakan tunggu" (Bot is loading, please wait) message.

**Cause**: WhatsApp client has not completed initialization or has disconnected.

**Check logs for**:
- `[WA] READY via ready` - Client is ready
- `[WA] Client not ready, message from X deferred` - Client not ready
- `[WA] Client disconnected` - Client lost connection

**Solution**:
1. Check if Chrome/Chromium is properly installed
2. Check if WhatsApp session is authenticated (QR code scan needed)
3. Check for authentication failures in logs
4. Restart the application to trigger re-initialization

### 3. Message Event Listeners Not Attached

**Symptom**: No log messages showing message reception despite WhatsApp being connected.

**Diagnostic**: Run the diagnostic checker:
```javascript
// In your startup logs, look for:
[WA] Attaching message event listeners to WhatsApp clients...
[WA] Message event listeners attached successfully.
[WA DIAGNOSTICS] ✓ waClient has 1 'message' listener(s)
[WA DIAGNOSTICS] ✓ waUserClient has 1 'message' listener(s)
[WA DIAGNOSTICS] ✓ waGatewayClient has 1 'message' listener(s)
```

**If listeners are missing**:
- Check `WA_SERVICE_SKIP_INIT` setting
- Check for errors during service initialization
- Review startup logs for exceptions

## Message Flow Debugging

To enable verbose debug logging for message flow troubleshooting, set:
```bash
export WA_DEBUG_LOGGING="true"
```

When enabled and a message is sent to the bot, you'll see these logs in sequence:

```
1. [WWEBJS-ADAPTER] Raw message received for clientId=wa-admin, from=628xxx@c.us
2. [WWEBJS-ADAPTER] Emitting 'message' event for clientId=wa-admin
3. [WA-EVENT-AGGREGATOR] Message received from adapter: wwebjs, jid: 628xxx@c.us
4. [WA-EVENT-AGGREGATOR] Processing wwebjs message: 628xxx@c.us:MESSAGE_ID
5. [WA] Incoming message from 628xxx@c.us: test message
```

**If you see**:
- Only log 1: Event emission is failing
- Only logs 1-2: Event aggregator is not receiving
- Only logs 1-3: Message handler is not being invoked
- Only logs 1-4: Message processing logic has an error
- All logs: Message is being processed normally

## Testing

### Quick Test
```bash
# Run the setup test script
node scripts/test-wa-setup.js

# Test with skip init enabled (should show "Should initialize clients: false")
WA_SERVICE_SKIP_INIT=true node scripts/test-wa-setup.js
```

### Full Integration Test
1. Start the application
2. Send a message to the WhatsApp bot
3. Check logs for the message flow sequence above
4. If any step is missing, identify the breaking point

## Prevention

### In .env file
```bash
# WhatsApp Service Configuration
# WA_SERVICE_SKIP_INIT=false
# WARNING: Setting WA_SERVICE_SKIP_INIT=true will disable WhatsApp message reception
# This should ONLY be used during testing, NEVER in production
# When set to true, the bot will NOT receive any messages
```

### In CI/CD
- Ensure test environments set `WA_SERVICE_SKIP_INIT=true`
- Ensure production environments do NOT set this variable or set it to `false`
- Add health checks to verify message listeners are attached

### Monitoring
Monitor these metrics:
- Number of messages received per hour (should be > 0 in active systems)
- Client ready/not ready state transitions
- Authentication failures
- Connection drops

If message reception drops to zero unexpectedly, check the causes above.

## Related Files

- `src/service/waService.js` - Main WhatsApp service, message handlers
- `src/service/wwebjsAdapter.js` - WhatsApp Web.js client wrapper
- `src/service/waEventAggregator.js` - Message deduplication
- `src/utils/waDiagnostics.js` - Diagnostic utilities
- `.env.example` - Environment variable documentation

## Support

If the issue persists after checking all the above:
1. Collect full startup logs
2. Enable debug logging if available
3. Check WhatsApp Web.js library version compatibility
4. Verify Chrome/Chromium installation
5. Check for filesystem permission issues (session data directory)
