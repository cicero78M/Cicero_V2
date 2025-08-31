import { requestPairingCode } from '../src/service/waAdapter.js';

const number = process.argv[2];
if (!number) {
  console.error('Usage: node scripts/requestPairingCode.js <phone-number>');
  process.exit(1);
}

requestPairingCode(number)
  .then((code) => {
    console.log('Pairing code:', code);
  })
  .catch((err) => {
    console.error('Failed to request pairing code:', err.message);
    process.exit(1);
  });
