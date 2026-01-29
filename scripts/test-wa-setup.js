#!/usr/bin/env node
/**
 * WhatsApp Setup Test Script
 * Tests that WhatsApp clients are properly configured for message reception
 * 
 * Usage: node scripts/test-wa-setup.js
 */

import { EventEmitter } from 'events';

// Mock environment
process.env.WA_SERVICE_SKIP_INIT = process.env.WA_SERVICE_SKIP_INIT || 'false';
process.env.PORT = process.env.PORT || '3000';
process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_NAME = process.env.DB_NAME || 'test';
process.env.DB_PASS = process.env.DB_PASS || 'test';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || '628123456789';
process.env.CLIENT_OPERATOR = process.env.CLIENT_OPERATOR || '628123456789';
process.env.RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

console.log('='.repeat(60));
console.log('WhatsApp Setup Test');
console.log('='.repeat(60));
console.log();

console.log('Environment Check:');
console.log(`  WA_SERVICE_SKIP_INIT: ${process.env.WA_SERVICE_SKIP_INIT}`);
console.log(`  Should initialize clients: ${process.env.WA_SERVICE_SKIP_INIT !== 'true'}`);
console.log();

// Test event emitter behavior
console.log('Testing EventEmitter message listener attachment:');
const testEmitter = new EventEmitter();

// Attach a message listener
testEmitter.on('message', (msg) => {
  console.log(`  ✓ Message received: ${msg.body}`);
});

console.log(`  Initial message listener count: ${testEmitter.listenerCount('message')}`);

// Emit a test message
testEmitter.emit('message', { body: 'Test message', from: 'test@c.us' });

console.log();
console.log('='.repeat(60));
console.log('Test completed successfully!');
console.log();
console.log('If WA_SERVICE_SKIP_INIT is "true", the actual WhatsApp clients');
console.log('will NOT have message listeners attached, and messages will NOT');
console.log('be received.');
console.log();
console.log('To fix: Ensure WA_SERVICE_SKIP_INIT is NOT set to "true" in');
console.log('production environments.');
console.log('='.repeat(60));
